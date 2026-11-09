/* =========================================================
   China Engine — servidor intermediário da API GTIN (Cloudflare Worker)

   Por que existe: a API GTIN não aceita chamadas feitas direto do navegador (CORS).
   Este Worker roda no Cloudflare, guarda o usuário e a senha da API como "segredos"
   e repassa só a consulta do código de barras para o app.

   Segredos que precisam ser cadastrados no Worker (Settings → Variables and Secrets):
     GTIN_USUARIO   usuário da API GTIN
     GTIN_SENHA     senha da API GTIN
     CHAVE_APP      uma frase/código que você inventa; o app envia essa chave em cada consulta
   Variável opcional:
     ORIGENS_PERMITIDAS  sites autorizados, separados por vírgula
                         (padrão: https://machadocreative.github.io)

   Rotas:
     GET /status           testa a chave do app e o login na API GTIN
     GET /gtin/{código}    consulta um código de barras (8, 12, 13 ou 14 dígitos)

   Este arquivo NÃO tem nenhuma senha: pode ficar no GitHub sem problema.
   ========================================================= */
const API = 'https://gtin.rscsistemas.com.br';
const ORIGENS_PADRAO = ['https://machadocreative.github.io'];

// O token da API vale 1 hora; fica guardado enquanto o Worker estiver "acordado"
let cacheToken = { token: null, expira: 0 };

export default {
  async fetch(req, env) {
    const origem = req.headers.get('Origin') || '';
    const permitidas = env.ORIGENS_PERMITIDAS
      ? env.ORIGENS_PERMITIDAS.split(',').map(s => s.trim()).filter(Boolean)
      : ORIGENS_PADRAO;
    const cors = {
      'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : permitidas[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Chave-App',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const responder = (status, obj) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
    });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return responder(405, { erro: 'metodo', mensagem: 'Use GET.' });

    if (!env.CHAVE_APP || req.headers.get('X-Chave-App') !== env.CHAVE_APP)
      return responder(401, { erro: 'chave_app', mensagem: 'Chave de acesso do app incorreta.' });
    if (!env.GTIN_USUARIO || !env.GTIN_SENHA)
      return responder(500, { erro: 'config', mensagem: 'Usuário e senha da API GTIN não foram cadastrados no Worker.' });

    const url = new URL(req.url);
    try {
      if (url.pathname === '/status') {
        await obterToken(env, true);
        return responder(200, { ok: true });
      }
      const m = url.pathname.match(/^\/gtin\/(\d{8}|\d{12,14})$/);
      if (!m) return responder(400, { erro: 'gtin_invalido', mensagem: 'Código de barras inválido.' });

      let token = await obterToken(env, false);
      let r = await consultar(m[1], token);
      if (r.status === 401) {               // token expirou antes do previsto: novo login
        token = await obterToken(env, true);
        r = await consultar(m[1], token);
      }
      // repassa a resposta da API (inclusive 404, 403 e 429) para o app tratar
      const h = { ...cors, 'Content-Type': r.headers.get('Content-Type') || 'application/json' };
      const ra = r.headers.get('Retry-After'); if (ra) h['Retry-After'] = ra;
      return new Response(await r.text(), { status: r.status, headers: h });
    } catch (e) {
      return responder(e.status || 502, e.corpo || { erro: 'api', mensagem: 'Falha ao falar com a API GTIN.' });
    }
  }
};

async function obterToken(env, forcar) {
  if (!forcar && cacheToken.token && cacheToken.expira > Date.now() + 60000) return cacheToken.token;
  const basic = btoa(String.fromCharCode(...new TextEncoder().encode(`${env.GTIN_USUARIO}:${env.GTIN_SENHA}`)));
  const r = await fetch(`${API}/api/v3/oauth/token`, {
    method: 'POST', body: '',
    headers: { 'Authorization': `Basic ${basic}`, 'Accept': 'application/json', 'User-Agent': 'ChinaEngine/1.0' }
  });
  let corpo = null; try { corpo = await r.json(); } catch (e) {}
  if (r.status === 401) throw { status: 502, corpo: { erro: 'credenciais_api', mensagem: 'Usuário ou senha da API GTIN (cadastrados no Worker) incorretos.' } };
  if (r.status === 403) throw { status: 403, corpo: corpo || { erro: 'plano' } };
  if (!r.ok || !corpo) throw { status: 502, corpo: { erro: 'api', mensagem: `A API GTIN respondeu ${r.status} ao gerar o token.` } };
  cacheToken = { token: corpo.access_token || corpo.token, expira: Date.now() + (corpo.expires_in || 3600) * 1000 };
  return cacheToken.token;
}

function consultar(gtin, token) {
  return fetch(`${API}/api/v3/gtin/${gtin}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'User-Agent': 'ChinaEngine/1.0' }
  });
}