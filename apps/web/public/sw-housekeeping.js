// Service worker mínimo do app de Governança — existe para tornar o app instalável (ícone na
// tela inicial, abre em tela cheia). NÃO faz cache de dados: a lista de quartos precisa sempre
// vir do servidor. Só entrega uma tela offline simples quando não há rede numa navegação.
const OFFLINE_URL = "/housekeeping/offline.html";
const CACHE = "housekeeping-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});
