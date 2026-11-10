/* China Engine — service worker
   Serve só para as notificações push (avisos de venda entre aparelhos).
   De propósito, NÃO guarda arquivos do app em cache: assim uma versão nova publicada
   no GitHub Pages aparece na hora, sem precisar limpar nada. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Aviso chegou (mesmo com o app fechado): mostra a notificação e avisa as janelas abertas
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.titulo || 'China Engine', {
      body: d.corpo || '',
      tag: d.tag || undefined,
      icon: 'icones/icone-192.png',
      badge: 'icones/icone-selo-96.png',
      data: { url: self.registration.scope }
    });
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    janelas.forEach(j => j.postMessage({ tipo: 'push' }));   // o app aberto sincroniza na hora
  })());
});

// Toque na notificação: volta para o app (ou abre, se estiver fechado)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) { if ('focus' in j) return j.focus(); }
    return self.clients.openWindow(self.registration.scope);
  })());
});