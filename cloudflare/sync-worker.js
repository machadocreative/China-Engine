/* =========================================================
   China Engine — sincronização na nuvem (Cloudflare Worker + banco D1)

   O que faz: guarda uma cópia dos dados da loja (o mesmo conteúdo do backup JSON)
   num banco D1 do seu Cloudflare, para o PC e o celular ficarem iguais.
   O app envia as alterações e recebe as dos outros aparelhos; quando dois aparelhos
   alteram ao mesmo tempo, o próprio app junta as alterações antes de enviar.

   Configuração no Cloudflare:
     1. Storage & Databases → D1 → Create → nome: china-engine
     2. Neste Worker: Settings → Bindings → Add → D1 database
          Variable name: DB   ·   Database: china-engine
     3. Settings → Variables and Secrets → Add → tipo Secret
          SENHA_SYNC   uma senha forte que você inventa (o app pede essa senha em cada aparelho)
     Variável opcional:
          ORIGENS_PERMITIDAS  sites autorizados, separados por vírgula
                              (padrão: https://machadocreative.github.io)
   As tabelas são criadas sozinhas na primeira chamada.

   Rotas (todas exigem o cabeçalho  Authorization: Bearer <SENHA_SYNC>):
     GET  /versao          versão atual na nuvem (consulta leve, usada para saber se há novidade)
     GET  /dados           dados completos + versão
     PUT  /dados           envia os dados: { base, aparelho, dados }
                           base = versão em que o aparelho se baseou. Se a nuvem já estiver
                           em outra versão, responde 409 com os dados atuais (o app junta e reenvia).
     GET  /copias          lista as cópias diárias (últimos 30 dias)
     GET  /copias/{dia}    dados de uma cópia diária (AAAA-MM-DD)

   Limites do plano gratuito do D1: 100 mil linhas gravadas e 5 milhões lidas por dia;
   cada envio grava 1 linha (2 na primeira alteração do dia, por causa da cópia diária).
   Os dados são guardados compactados (gzip); o limite do D1 é 2 MB por linha compactada
   (algo como 15 a 20 MB de dados) — muito acima do tamanho de uma loja.

   Este arquivo NÃO tem nenhuma senha: pode ficar no GitHub sem problema.
   ========================================================= */
const ORIGENS_PADRAO = ['https://machadocreative.github.io'];
const DIAS_COPIAS = 30;
const LIMITE_LINHA = 1_900_000;   // margem abaixo dos 2 MB do D1
const FUSO = 'America/Sao_Paulo';

let tabelasProntas = false;

export default {
  async fetch(req, env) {
    const origem = req.headers.get('Origin') || '';
    const permitidas = env.ORIGENS_PERMITIDAS
      ? env.ORIGENS_PERMITIDAS.split(',').map(s => s.trim()).filter(Boolean)
      : ORIGENS_PADRAO;
    const cors = {
      'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : permitidas[0],
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const responder = (status, obj) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (!env.SENHA_SYNC)
      return responder(500, { erro: 'config', mensagem: 'A senha SENHA_SYNC não foi cadastrada no Worker (Settings → Variables and Secrets).' });
    if (!env.DB)
      return responder(500, { erro: 'config', mensagem: 'O banco D1 não está ligado ao Worker (Settings → Bindings → D1, nome DB).' });

    const auth = req.headers.get('Authorization') || '';
    const senha = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!(await iguaisSeguro(senha, env.SENHA_SYNC))) {
      await new Promise(r => setTimeout(r, 800));   // freia tentativas de adivinhar a senha
      return responder(401, { erro: 'senha', mensagem: 'Senha da sincronização incorreta.' });
    }

    const url = new URL(req.url);
    const caminho = url.pathname.replace(/\/+$/, '') || '/';
    try {
      await prepararTabelas(env.DB);

      if (req.method === 'GET' && (caminho === '/versao' || caminho === '/status')) {
        const r = await env.DB.prepare('SELECT versao, atualizado_em, aparelho FROM estado WHERE id = 1').first();
        return responder(200, { ok: true, versao: r ? r.versao : 0, atualizadoEm: r ? r.atualizado_em : null, aparelho: r ? r.aparelho : null });
      }

      if (req.method === 'GET' && caminho === '/dados') {
        return responder(200, await lerAtual(env.DB));
      }

      if (req.method === 'PUT' && caminho === '/dados') {
        let corpo;
        try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
        const base = Number(corpo && corpo.base);
        const dados = corpo && corpo.dados;
        if (!Number.isInteger(base) || base < 0 || !dados || typeof dados !== 'object' || !Array.isArray(dados.produtos))
          return responder(400, { erro: 'dados', mensagem: 'Dados inválidos: faltam produtos ou a versão base.' });
        const aparelho = String(corpo.aparelho || '').slice(0, 60) || 'Aparelho';

        const bin = await compactar(JSON.stringify(dados));
        if (bin.byteLength > LIMITE_LINHA)
          return responder(413, { erro: 'tamanho', mensagem: 'Os dados ficaram grandes demais para a sincronização. Fale com quem mantém o app.' });

        const agora = new Date().toISOString();
        const db = env.DB;
        const passos = [];

        // Cópia diária: na primeira gravação de um dia novo, guarda como o dia anterior terminou
        const atual = await db.prepare('SELECT atualizado_em FROM estado WHERE id = 1').first();
        if (atual && diaLocal(atual.atualizado_em) !== diaLocal(agora)) {
          passos.push(db.prepare(
            'INSERT OR IGNORE INTO copias (dia, versao, atualizado_em, aparelho, dados) ' +
            'SELECT ?, versao, atualizado_em, aparelho, dados FROM estado WHERE id = 1'
          ).bind(diaLocal(atual.atualizado_em)));
          passos.push(db.prepare('DELETE FROM copias WHERE dia < ?').bind(diaLocal(new Date(Date.now() - DIAS_COPIAS * 86400000).toISOString())));
        }
        // Grava só se a nuvem ainda estiver na versão em que o aparelho se baseou
        passos.push(base === 0
          ? db.prepare('INSERT INTO estado (id, versao, atualizado_em, aparelho, dados) VALUES (1, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
              .bind(agora, aparelho, bin)
          : db.prepare('UPDATE estado SET versao = versao + 1, atualizado_em = ?, aparelho = ?, dados = ? WHERE id = 1 AND versao = ?')
              .bind(agora, aparelho, bin, base));
        const res = await db.batch(passos);
        const gravou = res[res.length - 1].meta.changes > 0;

        if (!gravou) return responder(409, { erro: 'conflito', ...(await lerAtual(db)) });
        return responder(200, { ok: true, versao: base + 1, atualizadoEm: agora, aparelho });
      }

      if (req.method === 'GET' && caminho === '/copias') {
        const { results } = await env.DB.prepare(
          'SELECT dia, versao, atualizado_em, aparelho, length(dados) AS tamanho FROM copias ORDER BY dia DESC'
        ).all();
        return responder(200, { copias: results.map(c => ({ dia: c.dia, versao: c.versao, atualizadoEm: c.atualizado_em, aparelho: c.aparelho, tamanho: c.tamanho })) });
      }

      const mc = caminho.match(/^\/copias\/(\d{4}-\d{2}-\d{2})$/);
      if (req.method === 'GET' && mc) {
        const c = await env.DB.prepare('SELECT dia, versao, atualizado_em, aparelho, dados FROM copias WHERE dia = ?').bind(mc[1]).first();
        if (!c) return responder(404, { erro: 'copia', mensagem: 'Cópia não encontrada.' });
        return responder(200, { dia: c.dia, versao: c.versao, atualizadoEm: c.atualizado_em, aparelho: c.aparelho, dados: JSON.parse(await descompactar(c.dados)) });
      }

      return responder(404, { erro: 'rota', mensagem: 'Rota não encontrada.' });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/limit|exceeded/i.test(msg))
        return responder(503, { erro: 'limite', mensagem: 'O limite diário gratuito do banco D1 foi atingido. Volta a funcionar à meia-noite (UTC).' });
      return responder(500, { erro: 'banco', mensagem: 'Falha no banco de dados da sincronização.', detalhe: msg.slice(0, 200) });
    }
  }
};

async function prepararTabelas(db) {
  if (tabelasProntas) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS estado (id INTEGER PRIMARY KEY, versao INTEGER NOT NULL, atualizado_em TEXT NOT NULL, aparelho TEXT, dados BLOB NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS copias (dia TEXT PRIMARY KEY, versao INTEGER, atualizado_em TEXT, aparelho TEXT, dados BLOB NOT NULL)')
  ]);
  tabelasProntas = true;
}

async function lerAtual(db) {
  const r = await db.prepare('SELECT versao, atualizado_em, aparelho, dados FROM estado WHERE id = 1').first();
  if (!r) return { versao: 0, atualizadoEm: null, aparelho: null, dados: null };
  return { versao: r.versao, atualizadoEm: r.atualizado_em, aparelho: r.aparelho, dados: JSON.parse(await descompactar(r.dados)) };
}

/* Data AAAA-MM-DD no horário de Brasília */
function diaLocal(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

async function compactar(texto) {
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}
async function descompactar(valor) {
  // o D1 pode devolver BLOB como ArrayBuffer, Uint8Array ou lista de números
  const bytes = valor instanceof ArrayBuffer ? new Uint8Array(valor)
    : ArrayBuffer.isView(valor) ? new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength)
    : new Uint8Array(valor);
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(fluxo).text();
}

/* Compara senhas sem vazar, pelo tempo de resposta, quantos caracteres estão certos */
async function iguaisSeguro(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b)))
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}
