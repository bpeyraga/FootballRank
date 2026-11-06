// Service worker mínimo: hace que la app se pueda instalar ("Instalar app" / "Agregar a pantalla de inicio").
// No guarda nada en caché a propósito: cada deploy de Vercel se ve al toque, sin versiones viejas trabadas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* pasa directo a la red */ });
