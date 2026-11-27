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

   Quem pode entrar (2.14.0):
     - a SENHA_SYNC (senha mestra) → nível Gerente;
     - a chave própria de um aparelho conectado pelo QR code / código de 6 dígitos → o nível que o
       Gerente ou o Administrador escolheu (Gerente, Administrador, Caixa ou Só consulta). A chave nunca é guardada aqui:
       o banco só tem o "resumo" dela (SHA-256). Remover o aparelho desliga a chave na hora.

   Rotas (todas exigem o cabeçalho  Authorization: Bearer <SENHA_SYNC ou chave do aparelho>):
     GET  /versao          versão atual na nuvem (consulta leve, usada para saber se há novidade)
     GET  /dados           dados completos + versão
     PUT  /dados           envia os dados: { base, aparelho, dados }
                           base = versão em que o aparelho se baseou. Se a nuvem já estiver
                           em outra versão, responde 409 com os dados atuais (o app junta e reenvia).
     GET  /copias          lista as cópias diárias (últimos 30 dias)
     GET  /copias/{dia}    dados de uma cópia diária (AAAA-MM-DD)

   Notificações push (avisos de venda entre aparelhos):
     GET    /push/chave      chave pública usada pelos aparelhos para se inscrever
     POST   /push/inscricao  guarda a inscrição de um aparelho: { aparelho, inscricao }
     DELETE /push/inscricao  remove a inscrição: { endpoint }
     POST   /push/enviar     envia um aviso: { titulo, corpo, tag, excluir?, somente? }
                             excluir = endereço do aparelho que fez a venda (não recebe o próprio aviso)
   Aparelhos conectados (2.11.0):
     Toda chamada pode levar ?ap=<id do aparelho>&apn=<nome>. O Worker registra o aparelho e a hora do
     último acesso. Aparelho removido recebe 403 { erro:'revogado' } e o app desconecta sozinho.
     GET    /aparelhos       lista os aparelhos (id, nome, criado, último acesso, nível, tem push)
     DELETE /aparelhos/{id}  remove o aparelho (e as notificações dele)
     PATCH  /aparelhos/{id}  muda o nível de um aparelho conectado pelo QR: { nivel }
     Níveis (2.15.0): Gerente > Administrador > Caixa > Só consulta. Gerente e Administrador veem e
     mexem na lista; o nível de um aparelho Gerente só ele mesmo muda; só outro Gerente o remove;
     só um Gerente dá o nível Gerente.
     Gerente e Administrador veem e alteram a lista. Aparelho conectado com a SENHA_SYNC é sempre Gerente:
     para impedir que ele volte a conectar, troque também a SENHA_SYNC.

   Conectar um aparelho novo pelo QR code (2.14.0):
     POST /pareamento        (Gerente ou Administrador; só o Gerente cria Gerente) cria um código de
                             6 dígitos de uso único, válido por 2 minutos: { nivel }
     POST /pareamento/usar   (sem senha: o próprio código é a credencial) { codigo, nome, aparelhoId }
                             → { chave, nivel }. Depois de 10 tentativas erradas, os códigos abertos
                             deixam de valer (é preciso gerar outro).
   Log de alterações (2.18.0):
     POST /log   cada aparelho envia as ações que fez: { eventos:[{ id, quando, tipo, acao, detalhe, valor, ref }] }
                 (o nome do aparelho vem da conexão, não do que ele manda; repetidos são ignorados)
     GET  /log   (Gerente ou Administrador) lista do mais recente para o mais antigo, 50 por vez:
                 ?pular=0&aparelho=<id>&tipo=<tipo>&dia=AAAA-MM-DD
     Não existe rota para apagar ou editar o log. O que tem mais de 1 ano sai sozinho.
     O próprio Worker registra os eventos de segurança: aparelho conectado (senha ou código), código
     gerado, código errado, senha errada, nível alterado e aparelho removido.
   Leitor de Pix (2.19.0): o app Android lê as notificações de Pix do banco e avisa aqui.
     O leitor entra com o código de 6 dígitos no nível "Leitor de Pix", que só pode usar POST /pix.
     POST  /pix         { id, valor, origem, quando, pacote, teste? } → guarda (sem nome de quem pagou)
                        e, se ninguém registrou uma venda no Pix com esse valor, avisa os aparelhos
     GET   /pix         (Gerente/Administrador) Pix dos últimos dias (?dias=7)
     PATCH /pix/{id}    (Gerente/Administrador) { status: registrado | dispensado | conferido, vendaId? }
   Curtir uma venda (2.19.0):
     POST  /curtir      { para: <id do aparelho que vendeu>, ref } → avisa esse aparelho: "Fulano mandou um curtir pela venda!"
   O que cada nível pode fazer aqui: Caixa e Só consulta não veem a lista de aparelhos, as cópias
   diárias nem geram códigos; Só consulta também não envia dados (PUT /dados).

   O par de chaves do push (VAPID) é criado sozinho na primeira vez e fica guardado no banco D1,
   dentro da sua conta do Cloudflare: não há nenhuma senha nova para cadastrar.
   O texto do aviso viaja criptografado até o aparelho (padrão Web Push, RFC 8291).

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
const NIVEIS = ['gerente', 'admin', 'caixa', 'consulta', 'leitor'];   // 2.15.0: Administrador; 2.19.0: Leitor de Pix (só avisa Pix)
const PAREAMENTO_MIN = 2;          // validade do código de 6 dígitos
const PAREAMENTO_TENTATIVAS = 10;  // erros seguidos que invalidam os códigos abertos
const nivelNormal = n => NIVEIS.includes(n) ? n : 'consulta';   // chave com nível desconhecido: o mínimo
const NOME_NIVEL = { gerente: 'Gerente', admin: 'Administrador', caixa: 'Caixa', consulta: 'Só consulta', leitor: 'Leitor de Pix' };
const PIX_ESPERA_SEG = 20;   // espera antes de avisar: dá tempo de a venda do PDV chegar e o Pix ser conferido sozinho
const PIX_JANELA_MIN = 15;   // venda no Pix com o mesmo valor até 15 min antes do Pix = já registrada
const LOG_DIAS = 365;
const LOG_TIPOS = ['venda', 'estoque', 'cadastro', 'edicao', 'exclusao', 'ajuste', 'seguranca', 'sistema'];
let ultimaLimpezaLog = 0;

/* Grava um evento no log. limiteSeg: não repete o mesmo evento (ação + aparelho) dentro desse intervalo
   (evita que alguém encha o log tentando senhas) */
async function logEvento(db, ev, limiteSeg) {
  try {
    const agora = new Date().toISOString();
    if (limiteSeg) {
      const ult = await db.prepare('SELECT recebido FROM log WHERE acao = ? AND IFNULL(aparelho_id, \'\') = ? ORDER BY recebido DESC LIMIT 1')
        .bind(ev.acao, ev.aparelhoId || '').first();
      if (ult && Date.now() - Date.parse(ult.recebido) < limiteSeg * 1000) return;
    }
    await db.prepare('INSERT OR IGNORE INTO log (id, quando, recebido, aparelho_id, aparelho_nome, tipo, acao, detalhe, valor, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(ev.id || ('w' + crypto.randomUUID()), ev.quando || agora, agora, ev.aparelhoId || null, ev.aparelhoNome || null,
        ev.tipo || 'seguranca', String(ev.acao || '').slice(0, 80), String(ev.detalhe || '').slice(0, 300), ev.valor ?? null, ev.ref || null).run();
  } catch (e) { /* o log nunca derruba a chamada principal */ }
}

let tabelasProntas = false;

export default {
  async fetch(req, env, ctx) {
    const origem = req.headers.get('Origin') || '';
    const permitidas = env.ORIGENS_PERMITIDAS
      ? env.ORIGENS_PERMITIDAS.split(',').map(s => s.trim()).filter(Boolean)
      : ORIGENS_PADRAO;
    const cors = {
      'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : permitidas[0],
      'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
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

    const url = new URL(req.url);
    const caminho = url.pathname.replace(/\/+$/, '') || '/';
    const auth = req.headers.get('Authorization') || '';
    const senha = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const negar = async () => {
      await logEvento(env.DB, { tipo: 'seguranca', acao: 'Tentativa de acesso com senha errada', detalhe: 'Senha da sincronização ou chave de aparelho inválida (repetições em 1 minuto contam uma vez)', aparelhoNome: (url.searchParams.get('apn') || '').slice(0, 60) || null }, 60);
      await new Promise(r => setTimeout(r, 800));   // freia tentativas de adivinhar a senha
      return responder(401, { erro: 'senha', mensagem: 'Senha da sincronização incorreta.' });
    };
    try {
      await prepararTabelas(env.DB);

      // ----- Aparelho novo usando o código do QR (antes da senha: o código é a credencial) -----
      if (req.method === 'POST' && caminho === '/pareamento/usar') return await usarPareamento(req, env.DB, responder, logEvento);

      // ----- Quem está chamando: senha mestra (Gerente) ou chave de um aparelho conectado pelo QR -----
      let nivel = null, apChave = null;
      if (await iguaisSeguro(senha, env.SENHA_SYNC)) nivel = 'gerente';
      else if (/^ce_[A-Za-z0-9_-]{20,100}$/.test(senha)) {
        const a = await env.DB.prepare('SELECT id, nivel, revogado FROM aparelhos WHERE chave_hash = ?').bind(await resumo(senha)).first();
        if (a && a.revogado) return responder(403, { erro: 'revogado', mensagem: 'Este aparelho foi removido da sincronização.' });
        if (a) { nivel = nivelNormal(a.nivel); apChave = a.id; }
      }
      if (!nivel) return await negar();
      const gerente = nivel === 'gerente';
      const total = nivel === 'gerente' || nivel === 'admin';   // Gerente e Administrador
      const soTotal = () => responder(403, { erro: 'nivel', mensagem: 'Só um aparelho Gerente ou Administrador pode fazer isso.' });
      // Leitor de Pix: só avisa pagamentos (não lê nem altera nada da loja)
      if (nivel === 'leitor' && !((req.method === 'POST' && caminho === '/pix') || (req.method === 'GET' && caminho === '/versao')))
        return responder(403, { erro: 'nivel', mensagem: 'O Leitor de Pix só pode avisar pagamentos.' });

      // ----- Aparelho que está chamando (registro, último acesso e remoção) -----
      const apId = apChave || (url.searchParams.get('ap') || '').slice(0, 64);   // com chave própria, vale o aparelho da chave
      const apOk = /^[A-Za-z0-9_-]{4,64}$/.test(apId);
      const apNome = (url.searchParams.get('apn') || '').slice(0, 60) || 'Aparelho';
      const quem = { aparelhoId: apOk ? apId : null, aparelhoNome: apNome };
      if (apOk) {
        const agora = new Date().toISOString();
        const ap = await env.DB.prepare('SELECT nome, visto_em, revogado, nivel, chave_hash FROM aparelhos WHERE id = ?').bind(apId).first();
        if (ap && ap.revogado)
          return responder(403, { erro: 'revogado', mensagem: 'Este aparelho foi removido da sincronização.' });
        if (!ap) {
          await env.DB.prepare("INSERT INTO aparelhos (id, nome, criado_em, visto_em, nivel, revogado) VALUES (?, ?, ?, ?, 'gerente', 0)").bind(apId, apNome, agora, agora).run();
          await logEvento(env.DB, { ...quem, tipo: 'seguranca', acao: 'Aparelho conectado', detalhe: 'Com a senha da sincronização · Gerente' });
        } else if (!apChave && (ap.chave_hash || ap.nivel !== 'gerente')) {
          // 2.15.1: aparelho que antes entrou pelo QR e agora usa a SENHA_SYNC passa a ser Gerente na lista
          // (a chave antiga dele deixa de valer)
          await env.DB.prepare("UPDATE aparelhos SET nome = ?, visto_em = ?, nivel = 'gerente', chave_hash = NULL WHERE id = ?").bind(apNome, agora, apId).run();
          await logEvento(env.DB, { ...quem, tipo: 'seguranca', acao: 'Aparelho conectado', detalhe: 'Com a senha da sincronização · passou a ser Gerente' });
        }
        else if (ap.nome !== apNome || Date.now() - Date.parse(ap.visto_em || 0) > 5 * 60000)   // grava no máximo a cada 5 min
          await env.DB.prepare('UPDATE aparelhos SET nome = ?, visto_em = ? WHERE id = ?').bind(apNome, agora, apId).run();
      }

      if (req.method === 'GET' && caminho === '/aparelhos') {
        if (!total) return soTotal();
        const { results } = await env.DB.prepare(
          'SELECT a.id, a.nome, a.criado_em, a.visto_em, a.nivel, a.chave_hash IS NOT NULL AS pareado, ' +
          '(SELECT COUNT(*) FROM push_inscricoes p WHERE p.aparelho_id = a.id) AS push ' +
          'FROM aparelhos a WHERE a.revogado = 0 ORDER BY a.visto_em DESC'
        ).all();
        return responder(200, { aparelhos: results.map(a => ({ id: a.id, nome: a.nome, criadoEm: a.criado_em, vistoEm: a.visto_em, nivel: a.pareado ? nivelNormal(a.nivel) : 'gerente', pareado: !!a.pareado, push: a.push > 0, atual: a.id === apId })) });
      }
      const ma = caminho.match(/^\/aparelhos\/([A-Za-z0-9_-]{4,64})$/);
      if (ma && (req.method === 'DELETE' || req.method === 'PATCH') && !total) return soTotal();
      // nível do aparelho alvo: sem chave própria = entrou com a SENHA_SYNC = Gerente
      const alvo = ma ? await env.DB.prepare('SELECT chave_hash, nivel, nome FROM aparelhos WHERE id = ? AND revogado = 0').bind(ma[1]).first() : null;
      const alvoNivel = alvo ? (alvo.chave_hash ? nivelNormal(alvo.nivel) : 'gerente') : null;
      if (req.method === 'PATCH' && ma) {
        let corpo;
        try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
        if (!NIVEIS.includes(corpo && corpo.nivel)) return responder(400, { erro: 'nivel', mensagem: 'Nível inválido.' });
        if (!alvo) return responder(404, { erro: 'aparelho', mensagem: 'Aparelho não encontrado.' });
        if (!alvo.chave_hash) return responder(400, { erro: 'senha-mestra', mensagem: 'Este aparelho entrou com a senha da sincronização e é sempre Gerente.' });
        // Gerente: ninguém muda o nível dele, só ele mesmo
        if (alvoNivel === 'gerente' && ma[1] !== apId) return responder(403, { erro: 'nivel', mensagem: 'Só o próprio aparelho Gerente pode mudar o nível dele.' });
        // Administrador não dá nem tira o nível Gerente
        if (corpo.nivel === 'gerente' && !gerente) return responder(403, { erro: 'nivel', mensagem: 'Só um Gerente pode dar o nível Gerente.' });
        if (alvoNivel === 'leitor' || corpo.nivel === 'leitor') return responder(400, { erro: 'nivel', mensagem: 'O Leitor de Pix não troca de nível. Para mudar, remova e conecte de novo.' });
        await env.DB.prepare('UPDATE aparelhos SET nivel = ? WHERE id = ?').bind(corpo.nivel, ma[1]).run();
        await logEvento(env.DB, { ...quem, tipo: 'seguranca', acao: 'Nível alterado', detalhe: `${alvo.nome || 'Aparelho'}: ${NOME_NIVEL[alvoNivel]} → ${NOME_NIVEL[corpo.nivel]}` });
        return responder(200, { ok: true });
      }
      if (req.method === 'DELETE' && ma) {
        // aparelho Gerente só sai por outro Gerente (perda ou roubo)
        if (alvoNivel === 'gerente' && !gerente) return responder(403, { erro: 'nivel', mensagem: 'Só outro Gerente pode remover um aparelho Gerente.' });
        await env.DB.batch([
          env.DB.prepare('UPDATE aparelhos SET revogado = 1 WHERE id = ?').bind(ma[1]),
          env.DB.prepare('DELETE FROM push_inscricoes WHERE aparelho_id = ?').bind(ma[1])
        ]);
        if (alvo) await logEvento(env.DB, { ...quem, tipo: 'seguranca', acao: 'Aparelho removido', detalhe: `${alvo.nome || 'Aparelho'} (${NOME_NIVEL[alvoNivel]})` });
        return responder(200, { ok: true });
      }

      if (req.method === 'POST' && caminho === '/pareamento') {
        if (!total) return soTotal();
        let corpo = {};
        try { corpo = await req.json(); } catch (e) {}
        const nivelNovo = NIVEIS.includes(corpo.nivel) ? corpo.nivel : 'caixa';
        if (nivelNovo === 'gerente' && !gerente) return responder(403, { erro: 'nivel', mensagem: 'Só um Gerente pode conectar outro aparelho como Gerente.' });
        const agora = Date.now();
        await env.DB.prepare('DELETE FROM pareamentos WHERE expira_em < ? OR usado = 1').bind(agora).run();
        let codigo = '';
        for (let i = 0; i < 5 && !codigo; i++) {
          const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
          const c = String(n).padStart(6, '0');
          const ja = await env.DB.prepare('SELECT 1 FROM pareamentos WHERE codigo = ?').bind(c).first();
          if (!ja) codigo = c;
        }
        if (!codigo) return responder(503, { erro: 'pareamento', mensagem: 'Tente gerar o código de novo.' });
        const expira = agora + PAREAMENTO_MIN * 60000;
        await env.DB.prepare('INSERT INTO pareamentos (codigo, nivel, expira_em, criado_por, usado, falhas) VALUES (?, ?, ?, ?, 0, 0)')
          .bind(codigo, nivelNovo, expira, apOk ? apId : null).run();
        await logEvento(env.DB, { ...quem, tipo: 'seguranca', acao: 'Código de conexão gerado', detalhe: `Para um aparelho ${NOME_NIVEL[nivelNovo]} (vale 2 minutos)` });
        return responder(200, { ok: true, codigo, nivel: nivelNovo, expiraEm: new Date(expira).toISOString(), validadeSeg: PAREAMENTO_MIN * 60 });
      }

      // ----- Log de alterações (2.18.0) -----
      if (req.method === 'POST' && caminho === '/log') {
        let corpo;
        try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
        const eventos = Array.isArray(corpo && corpo.eventos) ? corpo.eventos.slice(0, 200) : [];
        const agora = new Date().toISOString(), aceitos = [];
        const passos = eventos.filter(e => e && /^[A-Za-z0-9_-]{4,64}$/.test(String(e.id || '')) && e.acao).map(e => {
          aceitos.push(String(e.id));
          const quando = /^\d{4}-\d{2}-\d{2}T/.test(String(e.quando || '')) ? String(e.quando).slice(0, 30) : agora;
          const valor = typeof e.valor === 'number' && isFinite(e.valor) ? Math.round(e.valor * 100) / 100 : null;
          return env.DB.prepare('INSERT OR IGNORE INTO log (id, quando, recebido, aparelho_id, aparelho_nome, tipo, acao, detalhe, valor, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind((apOk ? apId : 'x') + ':' + String(e.id), quando, agora, apOk ? apId : null, apNome,
              LOG_TIPOS.includes(e.tipo) ? e.tipo : 'sistema', String(e.acao).slice(0, 80), String(e.detalhe || '').slice(0, 300), valor, e.ref ? String(e.ref).slice(0, 64) : null);
        });
        if (Date.now() - ultimaLimpezaLog > 3600000) {   // limpeza do que tem mais de 1 ano, no máximo 1 vez por hora
          ultimaLimpezaLog = Date.now();
          passos.push(env.DB.prepare('DELETE FROM log WHERE recebido < ?').bind(new Date(Date.now() - LOG_DIAS * 86400000).toISOString()));
        }
        if (passos.length) await env.DB.batch(passos);
        return responder(200, { ok: true, recebidos: aceitos });
      }
      if (req.method === 'GET' && caminho === '/log') {
        if (!total) return soTotal();
        const pular = Math.max(0, parseInt(url.searchParams.get('pular')) || 0);
        const filtros = [], binds = [];
        const fAp = url.searchParams.get('aparelho'), fTipo = url.searchParams.get('tipo'), fDia = url.searchParams.get('dia');
        if (fAp) { filtros.push('aparelho_id = ?'); binds.push(fAp); }
        if (fTipo && LOG_TIPOS.includes(fTipo)) { filtros.push('tipo = ?'); binds.push(fTipo); }
        if (fDia && /^\d{4}-\d{2}-\d{2}$/.test(fDia)) {   // dia no horário de Brasília (−3h)
          filtros.push('quando >= ? AND quando < ?');
          const ini = new Date(fDia + 'T03:00:00.000Z');
          binds.push(ini.toISOString(), new Date(ini.getTime() + 86400000).toISOString());
        }
        const { results } = await env.DB.prepare(
          'SELECT id, quando, aparelho_id, aparelho_nome, tipo, acao, detalhe, valor, ref FROM log' +
          (filtros.length ? ' WHERE ' + filtros.join(' AND ') : '') + ' ORDER BY quando DESC, recebido DESC LIMIT 51 OFFSET ?'
        ).bind(...binds, pular).all();
        const aps = pular ? null : (await env.DB.prepare('SELECT DISTINCT aparelho_id AS id, aparelho_nome AS nome FROM log WHERE aparelho_id IS NOT NULL ORDER BY nome').all()).results;
        return responder(200, { eventos: results.slice(0, 50).map(r => ({ quando: r.quando, aparelhoId: r.aparelho_id, aparelho: r.aparelho_nome || '—', tipo: r.tipo, acao: r.acao, detalhe: r.detalhe, valor: r.valor, ref: r.ref })), mais: results.length > 50, aparelhos: aps });
      }

      if (req.method === 'GET' && (caminho === '/versao' || caminho === '/status')) {
        const r = await env.DB.prepare('SELECT versao, atualizado_em, aparelho FROM estado WHERE id = 1').first();
        return responder(200, { ok: true, versao: r ? r.versao : 0, atualizadoEm: r ? r.atualizado_em : null, aparelho: r ? r.aparelho : null, nivel, pareado: !!apChave });
      }

      if (req.method === 'GET' && caminho === '/dados') {
        return responder(200, await lerAtual(env.DB));
      }

      if (req.method === 'PUT' && caminho === '/dados') {
        if (nivel === 'consulta') return responder(403, { erro: 'nivel', mensagem: 'Este aparelho é só de consulta: ele não envia alterações.' });
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

      if (caminho.startsWith('/copias') && !total) return soTotal();
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

      // ----- Notificações push -----
      if (req.method === 'GET' && caminho === '/push/chave') {
        const v = await chavesPush(env.DB);
        return responder(200, { chave: v.publica });
      }

      if (caminho === '/push/inscricao' && (req.method === 'POST' || req.method === 'DELETE')) {
        let corpo;
        try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
        if (req.method === 'DELETE') {
          if (corpo && corpo.endpoint) await env.DB.prepare('DELETE FROM push_inscricoes WHERE endpoint = ?').bind(String(corpo.endpoint)).run();
          return responder(200, { ok: true });
        }
        const i = corpo && corpo.inscricao;
        if (!i || !ehEnderecoPush(i.endpoint) || !i.keys || !i.keys.p256dh || !i.keys.auth)
          return responder(400, { erro: 'inscricao', mensagem: 'Inscrição de notificação inválida.' });
        const passos = [];
        if (corpo.anterior) passos.push(env.DB.prepare('DELETE FROM push_inscricoes WHERE endpoint = ?').bind(String(corpo.anterior)));
        passos.push(env.DB.prepare(
          'INSERT INTO push_inscricoes (endpoint, p256dh, auth, aparelho, criado_em, aparelho_id) VALUES (?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho, aparelho_id = excluded.aparelho_id'
        ).bind(i.endpoint, String(i.keys.p256dh), String(i.keys.auth), String(corpo.aparelho || '').slice(0, 60) || 'Aparelho', new Date().toISOString(), apOk ? apId : null));
        // limite de segurança: no máximo 30 aparelhos inscritos (os mais antigos saem)
        passos.push(env.DB.prepare('DELETE FROM push_inscricoes WHERE endpoint NOT IN (SELECT endpoint FROM push_inscricoes ORDER BY criado_em DESC LIMIT 30)'));
        await env.DB.batch(passos);
        return responder(200, { ok: true });
      }

      if (req.method === 'POST' && caminho === '/push/enviar') {
        if (nivel === 'consulta') return responder(403, { erro: 'nivel', mensagem: 'Este aparelho é só de consulta.' });
        let corpo;
        try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
        // 2.19.0: a venda leva quem vendeu (para o botão "Curtir")
        const ehVenda = corpo.tipo === 'venda';
        const aviso = {
          titulo: String(corpo.titulo || 'China Engine').slice(0, 120),
          corpo: String(corpo.corpo || '').slice(0, 400),
          tag: String(corpo.tag || '').slice(0, 60),
          ...(ehVenda && apOk ? { tipo: 'venda', origemAp: apId, acoes: [{ action: 'curtir', title: 'Curtir' }] } : {})
        };
        const r = await avisarAparelhos(env.DB, i => corpo.somente ? i.endpoint === corpo.somente : i.endpoint !== corpo.excluir, aviso, origem || permitidas[0]);
        return responder(200, { ok: true, ...r });
      }

      // ----- Curtir uma venda (2.19.0) -----
      if (req.method === 'POST' && caminho === '/curtir') {
        let corpo;
        try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
        const para = String(corpo && corpo.para || '');
        if (!/^[A-Za-z0-9_-]{4,64}$/.test(para) || para === apId) return responder(400, { erro: 'dados', mensagem: 'Venda inválida.' });
        const ref = String(corpo.ref || '').slice(0, 64);
        // uma curtida por venda e por aparelho
        if (ref) {
          const ja = await env.DB.prepare("SELECT 1 FROM log WHERE acao = 'Curtida' AND aparelho_id = ? AND ref = ? LIMIT 1").bind(apOk ? apId : '', ref).first();
          if (ja) return responder(200, { ok: true, repetida: true });
        }
        const dono = await env.DB.prepare('SELECT nome FROM aparelhos WHERE id = ?').bind(para).first();
        const r = await avisarAparelhos(env.DB, i => i.aparelho_id === para, {
          titulo: `${apNome} mandou um curtir pela venda!`, corpo: 'Bom trabalho!', tag: 'curtida-' + (ref || Date.now()),
          tipo: 'curtida', nome: apNome
        }, origem || permitidas[0]);
        await logEvento(env.DB, { ...quem, tipo: 'sistema', acao: 'Curtida', detalhe: `${apNome} curtiu uma venda de ${dono ? dono.nome : 'outro aparelho'}`, ref: ref || null });
        return responder(200, { ok: true, ...r });
      }

      // ----- Leitor de Pix (2.19.0) -----
      if (req.method === 'POST' && caminho === '/pix') {
        if (nivel !== 'leitor' && !total) return soTotal();
        let corpo;
        try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
        const valor = Math.round(Number(corpo && corpo.valor) * 100) / 100;
        const origemPix = String(corpo.origem || 'Pix').slice(0, 40);
        if (corpo.teste) {
          await logEvento(env.DB, { ...quem, tipo: 'sistema', acao: 'Teste do leitor de Pix', detalhe: `O leitor está conectado e falando com o Worker (${origemPix})` });
          return responder(200, { ok: true, teste: true });
        }
        const id = String(corpo.id || '');
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || !(valor > 0) || valor > 1e7) return responder(400, { erro: 'dados', mensagem: 'Pix inválido.' });
        const agoraIso = new Date().toISOString();
        const quando = /^\d{4}-\d{2}-\d{2}T/.test(String(corpo.quando || '')) ? String(corpo.quando).slice(0, 30) : agoraIso;
        const ins = await env.DB.prepare('INSERT OR IGNORE INTO pix (id, quando, recebido, valor, origem, pacote, aparelho_id, aparelho_nome, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, quando, agoraIso, valor, origemPix, String(corpo.pacote || '').slice(0, 80), apOk ? apId : null, apNome, 'novo').run();
        if (!ins.meta.changes) return responder(200, { ok: true, repetido: true });
        await logEvento(env.DB, { ...quem, tipo: 'venda', acao: 'Pix recebido (leitor)', detalhe: origemPix, valor, ref: id });
        // espera um pouco: se a venda no Pix já foi (ou for logo) registrada no PDV, não incomoda ninguém
        const avisar = async () => {
          await new Promise(r => setTimeout(r, PIX_ESPERA_SEG * 1000));
          const desde = new Date(Date.parse(quando) - PIX_JANELA_MIN * 60000).toISOString();
          const venda = await env.DB.prepare("SELECT ref FROM log WHERE tipo = 'venda' AND acao NOT LIKE 'Pix%' AND valor = ? AND detalhe LIKE '%Pix%' AND quando >= ? " +
            'AND (ref IS NULL OR ref NOT IN (SELECT venda_id FROM pix WHERE venda_id IS NOT NULL)) ORDER BY quando DESC LIMIT 1').bind(valor, desde).first();
          const atual = await env.DB.prepare('SELECT status FROM pix WHERE id = ?').bind(id).first();
          if (!atual || atual.status !== 'novo') return;
          if (venda) {
            await env.DB.prepare("UPDATE pix SET status = 'conferido', venda_id = ?, resolvido_por = 'automático', resolvido_em = ? WHERE id = ? AND status = 'novo'")
              .bind(venda.ref || null, new Date().toISOString(), id).run();
            return;
          }
          const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(quando));
          const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
          await avisarAparelhos(env.DB, () => true, {
            titulo: `Novo Pix: ${brl}`, corpo: `Chegou no ${origemPix} às ${hora}. Já foi lançado no caixa?`, tag: 'pix-' + id,
            tipo: 'pix', pixId: id, acoes: [{ action: 'abrir', title: 'Abrir App' }, { action: 'dispensar', title: 'Já registrei' }]
          }, origem || permitidas[0]);
        };
        if (ctx && ctx.waitUntil) ctx.waitUntil(avisar().catch(() => {}));
        return responder(200, { ok: true });
      }
      if (req.method === 'GET' && caminho === '/pix') {
        if (!total) return soTotal();
        const dias = Math.min(60, Math.max(1, parseInt(url.searchParams.get('dias')) || 7));
        const desde = new Date(Date.now() - dias * 86400000).toISOString();
        const { results } = await env.DB.prepare("SELECT id, quando, valor, origem, aparelho_nome, status, venda_id, resolvido_por, resolvido_em FROM pix WHERE quando >= ? OR status = 'novo' ORDER BY quando DESC LIMIT 200").bind(desde).all();
        return responder(200, { pix: results.map(p => ({ id: p.id, quando: p.quando, valor: p.valor, origem: p.origem, leitor: p.aparelho_nome, status: p.status, vendaId: p.venda_id, resolvidoPor: p.resolvido_por, resolvidoEm: p.resolvido_em })) });
      }
      const mp = caminho.match(/^\/pix\/([A-Za-z0-9_-]{8,64})$/);
      if (req.method === 'PATCH' && mp) {
        if (!total) return soTotal();
        let corpo;
        try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
        if (!['registrado', 'dispensado', 'conferido', 'novo'].includes(corpo && corpo.status)) return responder(400, { erro: 'dados', mensagem: 'Situação inválida.' });
        const px = await env.DB.prepare('SELECT valor, origem, status FROM pix WHERE id = ?').bind(mp[1]).first();
        if (!px) return responder(404, { erro: 'pix', mensagem: 'Pix não encontrado.' });
        await env.DB.prepare('UPDATE pix SET status = ?, venda_id = ?, resolvido_por = ?, resolvido_em = ? WHERE id = ?')
          .bind(corpo.status, corpo.vendaId ? String(corpo.vendaId).slice(0, 64) : null, corpo.status === 'novo' ? null : apNome, corpo.status === 'novo' ? null : new Date().toISOString(), mp[1]).run();
        const txt = { registrado: 'Pix registrado numa venda', dispensado: 'Pix dispensado', conferido: 'Pix conferido', novo: 'Pix reaberto' }[corpo.status];
        if (corpo.status !== 'conferido' || corpo.manual) await logEvento(env.DB, { ...quem, tipo: 'venda', acao: txt, detalhe: px.origem, valor: px.valor, ref: mp[1] });
        return responder(200, { ok: true });
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
    db.prepare('CREATE TABLE IF NOT EXISTS copias (dia TEXT PRIMARY KEY, versao INTEGER, atualizado_em TEXT, aparelho TEXT, dados BLOB NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS push_chaves (id INTEGER PRIMARY KEY, publica TEXT NOT NULL, privada TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS push_inscricoes (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, aparelho TEXT, criado_em TEXT)'),
    db.prepare("CREATE TABLE IF NOT EXISTS aparelhos (id TEXT PRIMARY KEY, nome TEXT, criado_em TEXT, visto_em TEXT, nivel TEXT DEFAULT 'total', revogado INTEGER DEFAULT 0)")
  ]);
  // 2.11.0: liga cada inscrição de notificação ao aparelho (tabela já existia antes)
  try { await db.prepare('ALTER TABLE push_inscricoes ADD COLUMN aparelho_id TEXT').run(); } catch (e) { /* a coluna já existe */ }
  // 2.14.0: chave própria de cada aparelho conectado pelo QR (só o resumo SHA-256) e códigos de pareamento
  try { await db.prepare('ALTER TABLE aparelhos ADD COLUMN chave_hash TEXT').run(); } catch (e) { /* a coluna já existe */ }
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS pareamentos (codigo TEXT PRIMARY KEY, nivel TEXT NOT NULL, expira_em INTEGER NOT NULL, criado_por TEXT, usado INTEGER DEFAULT 0, falhas INTEGER DEFAULT 0)'),
    db.prepare('CREATE INDEX IF NOT EXISTS aparelhos_chave ON aparelhos (chave_hash)'),
    db.prepare('CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT)'),
    // 2.18.0: log de alterações (só cresce; o que tem mais de 1 ano sai sozinho)
    db.prepare('CREATE TABLE IF NOT EXISTS log (id TEXT PRIMARY KEY, quando TEXT NOT NULL, recebido TEXT NOT NULL, aparelho_id TEXT, aparelho_nome TEXT, tipo TEXT, acao TEXT, detalhe TEXT, valor REAL, ref TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS log_quando ON log (quando)'),
    db.prepare('CREATE INDEX IF NOT EXISTS log_recebido ON log (recebido)'),
    // 2.19.0: Pix lidos pelo leitor (sem o nome de quem pagou)
    db.prepare('CREATE TABLE IF NOT EXISTS pix (id TEXT PRIMARY KEY, quando TEXT NOT NULL, recebido TEXT, valor REAL NOT NULL, origem TEXT, pacote TEXT, aparelho_id TEXT, aparelho_nome TEXT, status TEXT NOT NULL, venda_id TEXT, resolvido_por TEXT, resolvido_em TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pix_quando ON pix (quando)')
  ]);
  // 2.15.0: o "Gerente" conectado pelo QR na 2.14.0 vira Administrador (uma vez só). Quem usa a SENHA_SYNC continua Gerente.
  const migrado = await db.prepare("SELECT valor FROM meta WHERE chave = 'niveis'").first();
  if (!migrado) {
    await db.batch([
      db.prepare("UPDATE aparelhos SET nivel = 'admin' WHERE chave_hash IS NOT NULL AND nivel IN ('gerente', 'total')"),
      db.prepare("UPDATE pareamentos SET nivel = 'admin' WHERE nivel = 'gerente' AND usado = 0"),
      db.prepare("INSERT OR IGNORE INTO meta (chave, valor) VALUES ('niveis', '2.15')")
    ]);
  }
  tabelasProntas = true;
}

/* Aparelho novo troca o código de 6 dígitos (QR code) por uma chave própria, com o nível escolhido pelo gerente */
async function usarPareamento(req, db, responder, logEvento) {
  let corpo;
  try { corpo = await req.json(); } catch (e) { return responder(400, { erro: 'json', mensagem: 'Dados inválidos.' }); }
  const codigo = String(corpo && corpo.codigo || '').replace(/\D/g, '');
  const apId = String(corpo && corpo.aparelhoId || '');
  const nome = String(corpo && corpo.nome || '').slice(0, 60) || 'Aparelho';
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(apId)) return responder(400, { erro: 'dados', mensagem: 'Identificação do aparelho inválida.' });
  const agora = Date.now();
  const p = codigo.length === 6
    ? await db.prepare('SELECT codigo, nivel FROM pareamentos WHERE codigo = ? AND usado = 0 AND expira_em >= ? AND falhas < ?').bind(codigo, agora, PAREAMENTO_TENTATIVAS).first()
    : null;
  if (!p) {
    // erro conta para todos os códigos abertos: depois de 10, nenhum vale mais (freia quem tenta adivinhar)
    await db.prepare('UPDATE pareamentos SET falhas = falhas + 1 WHERE usado = 0 AND expira_em >= ?').bind(agora).run();
    await logEvento(db, { tipo: 'seguranca', acao: 'Código de conexão errado', detalhe: `Tentativa de "${nome}" (repetições em 1 minuto contam uma vez)`, aparelhoNome: nome }, 60);
    await new Promise(r => setTimeout(r, 800));
    return responder(401, { erro: 'codigo', mensagem: 'Código inválido ou vencido. Gere um novo no aparelho do gerente.' });
  }
  // marca como usado antes de criar a chave: o mesmo código nunca vale duas vezes
  const uso = await db.prepare('UPDATE pareamentos SET usado = 1 WHERE codigo = ? AND usado = 0').bind(p.codigo).run();
  if (!uso.meta.changes) return responder(401, { erro: 'codigo', mensagem: 'Este código já foi usado. Gere um novo no aparelho do gerente.' });
  const chave = 'ce_' + b64url(crypto.getRandomValues(new Uint8Array(32)));
  const iso = new Date(agora).toISOString();
  await db.prepare(
    'INSERT INTO aparelhos (id, nome, criado_em, visto_em, nivel, revogado, chave_hash) VALUES (?, ?, ?, ?, ?, 0, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, visto_em = excluded.visto_em, nivel = excluded.nivel, revogado = 0, chave_hash = excluded.chave_hash'
  ).bind(apId, nome, iso, iso, nivelNormal(p.nivel), await resumo(chave)).run();
  await logEvento(db, { tipo: 'seguranca', acao: 'Aparelho conectado', detalhe: `Pelo código · ${NOME_NIVEL[nivelNormal(p.nivel)]}`, aparelhoId: apId, aparelhoNome: nome });
  return responder(200, { ok: true, chave, nivel: nivelNormal(p.nivel) });
}

/* Envia um aviso push para as inscrições escolhidas (filtro) e limpa as que o navegador cancelou */
async function avisarAparelhos(db, filtro, aviso, contato) {
  const { results } = await db.prepare('SELECT endpoint, p256dh, auth, aparelho_id FROM push_inscricoes').all();
  const alvos = results.filter(filtro);
  if (!alvos.length) return { enviadas: 0, falhas: 0 };
  const vapid = await chavesPush(db);
  const texto = JSON.stringify(aviso).slice(0, 3000);
  const mortos = [];
  let enviadas = 0, falhas = 0;
  await Promise.all(alvos.map(async i => {
    try {
      const r = await enviarPush(i, texto, vapid, contato);
      if (r.ok) enviadas++;
      else { falhas++; if (r.status === 404 || r.status === 410) mortos.push(i.endpoint); }   // inscrição cancelada no aparelho
    } catch (e) { falhas++; }
  }));
  if (mortos.length) await db.batch(mortos.map(m => db.prepare('DELETE FROM push_inscricoes WHERE endpoint = ?').bind(m)));
  return { enviadas, falhas };
}

/* Resumo SHA-256 (hex) da chave de um aparelho: é isso que fica no banco, nunca a chave */
async function resumo(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto))));
  return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
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

/* =========================================================
   NOTIFICAÇÕES PUSH (Web Push: VAPID + criptografia aes128gcm, só com a Web Crypto do Worker)
   ========================================================= */
const enc = new TextEncoder();
function b64url(bytes) {
  let t = '';
  new Uint8Array(bytes).forEach(b => { t += String.fromCharCode(b); });
  return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deB64url(t) {
  t = String(t).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Uint8Array.from(atob(t), c => c.charCodeAt(0));
}
function juntar(...partes) {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { saida.set(p, pos); pos += p.length; }
  return saida;
}
/* Só aceita endereços https dos serviços de push dos navegadores (evita usar o Worker para chamar outros sites) */
function ehEnderecoPush(u) {
  try {
    const x = new URL(String(u));
    if (x.protocol !== 'https:') return TESTE_LOCAL && x.hostname === 'localhost';
    return /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|windows\.com|microsoft\.com)$/.test(x.hostname);
  } catch (e) { return false; }
}
const TESTE_LOCAL = false;   // true só nos testes locais (aceita um servidor de push falso em http://localhost)

/* Par de chaves VAPID: criado na primeira vez e guardado no D1 */
let cacheVapid = null;
async function chavesPush(db) {
  if (cacheVapid) return cacheVapid;
  let linha = await db.prepare('SELECT publica, privada FROM push_chaves WHERE id = 1').first();
  if (!linha) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publica = b64url(await crypto.subtle.exportKey('raw', par.publicKey));
    const privada = JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey));
    await db.prepare('INSERT OR IGNORE INTO push_chaves (id, publica, privada) VALUES (1, ?, ?)').bind(publica, privada).run();
    linha = await db.prepare('SELECT publica, privada FROM push_chaves WHERE id = 1').first();   // se dois pedidos criaram ao mesmo tempo, vale o que foi gravado
  }
  const chave = await crypto.subtle.importKey('jwk', JSON.parse(linha.privada), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  cacheVapid = { publica: linha.publica, chave };
  return cacheVapid;
}

async function hkdf(sal, segredo, info, tamanho) {
  const k = await crypto.subtle.importKey('raw', segredo, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, k, tamanho * 8));
}

/* Envia um aviso para uma inscrição. Devolve a resposta do serviço de push do navegador. */
async function enviarPush(inscricao, texto, vapid, contato) {
  // 1) Identificação do servidor (VAPID): um JWT assinado com a chave privada
  const destino = new URL(inscricao.endpoint);
  const cab = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const dados = b64url(enc.encode(JSON.stringify({
    aud: destino.origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: /^https:/.test(contato || '') ? contato : 'https://machadocreative.github.io'
  })));
  const assinatura = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.chave, enc.encode(cab + '.' + dados));
  const jwt = cab + '.' + dados + '.' + b64url(assinatura);

  // 2) Criptografia do texto para o aparelho (RFC 8291, aes128gcm)
  const chaveAparelho = deB64url(inscricao.p256dh);     // chave pública do aparelho (65 bytes)
  const segredoAuth = deB64url(inscricao.auth);         // segredo de autenticação (16 bytes)
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const chaveEnvio = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const pubAparelho = await crypto.subtle.importKey('raw', chaveAparelho, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pubAparelho }, par.privateKey, 256));
  const ikm = await hkdf(segredoAuth, compartilhado, juntar(enc.encode('WebPush: info\0'), chaveAparelho, chaveEnvio), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const chaveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chaveAes, juntar(enc.encode(texto), new Uint8Array([2]))));
  const cabecalho = juntar(sal, new Uint8Array([0, 0, 16, 0]), new Uint8Array([chaveEnvio.length]), chaveEnvio);   // sal | tamanho do registro (4096) | chave de envio

  return fetch(inscricao.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapid.publica}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '43200',
      'Urgency': 'high'
    },
    body: juntar(cabecalho, cifrado)
  });
}
