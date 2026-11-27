/* China Engine — service worker
   Serve só para as notificações push (avisos de venda, Pix e curtidas entre aparelhos).
   De propósito, NÃO guarda arquivos do app em cache: assim uma versão nova publicada
   no GitHub Pages aparece na hora, sem precisar limpar nada.

   2.19.0: botões nas notificações
   - Venda: "Curtir" → avisa o aparelho que vendeu ("Fulano mandou um curtir pela venda!").
   - Pix (leitor): "Abrir App" → abre Ajustes da Loja → Pix recebidos; "Já registrei" → dispensa o Pix.
   Para os botões que falam com o Worker sem abrir o app, o app guarda aqui (Cache Storage deste site,
   o mesmo lugar onde já ficam os dados dele) o endereço e a chave da sincronização deste aparelho. */
const CACHE_SW = 'ce-sw';
const url = nome => new URL(nome, self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function lerJSON(nome) {
  try { const r = await (await caches.open(CACHE_SW)).match(url(nome)); return r ? await r.json() : null; }
  catch (e) { return null; }
}
async function gravarJSON(nome, valor) {
  try { await (await caches.open(CACHE_SW)).put(url(nome), new Response(JSON.stringify(valor))); } catch (e) {}
}
/* Chamada ao Worker com a chave deste aparelho (sem abrir o app) */
async function chamarWorker(metodo, caminho, corpo) {
  const s = await lerJSON('__ce_sync');
  if (!s || !s.url || !s.senha) return false;
  try {
    const r = await fetch(s.url + caminho + '?ap=' + encodeURIComponent(s.ap || '') + '&apn=' + encodeURIComponent(s.apn || ''), {
      method: metodo, headers: { 'Authorization': 'Bearer ' + s.senha, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {})
    });
    return r.ok;
  } catch (e) { return false; }
}

// Aviso chegou (mesmo com o app fechado): mostra a notificação e avisa as janelas abertas
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (d.tipo === 'curtida') {
      // curtida: o app aberto faz a animação; fechado, fica guardada para quando abrir
      janelas.forEach(j => j.postMessage({ tipo: 'curtida', nome: d.nome || '' }));
      const visivel = janelas.some(j => j.visibilityState === 'visible');
      if (visivel) return;
      const pend = (await lerJSON('__ce_curtidas')) || [];
      pend.push({ nome: d.nome || '', em: Date.now() });
      await gravarJSON('__ce_curtidas', pend.slice(-10));
    }
    await self.registration.showNotification(d.titulo || 'China Engine', {
      body: d.corpo || '',
      tag: d.tag || undefined,
      icon: 'imagens/icones/icone-192.png',
      badge: 'imagens/icones/icone-selo-96.png',
      actions: Array.isArray(d.acoes) ? d.acoes.slice(0, 2) : [],
      data: { tipo: d.tipo || '', origemAp: d.origemAp || '', pixId: d.pixId || '', ref: d.tag || '' }
    });
    if (d.tipo !== 'curtida') janelas.forEach(j => j.postMessage({ tipo: 'push' }));   // o app aberto sincroniza na hora
  })());
});

// Toque na notificação ou num dos botões
self.addEventListener('notificationclick', e => {
  const dados = e.notification.data || {};
  e.notification.close();
  e.waitUntil((async () => {
    if (e.action === 'curtir' && dados.origemAp) {
      await chamarWorker('POST', '/curtir', { para: dados.origemAp, ref: dados.ref });
      return;
    }
    if (e.action === 'dispensar' && dados.pixId) {
      await chamarWorker('PATCH', '/pix/' + encodeURIComponent(dados.pixId), { status: 'dispensado' });
      return;
    }
    const ver = dados.tipo === 'pix' ? 'pix' : '';
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) {
      if ('focus' in j) { await j.focus(); if (ver) j.postMessage({ tipo: 'abrir', ver }); return; }
    }
    return self.clients.openWindow(self.registration.scope + (ver ? '?ver=' + ver : ''));
  })());
});
