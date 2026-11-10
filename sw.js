// Guarda só a "casca" do aplicativo para abrir sem rede. Dados financeiros nunca ficam em cache aqui.
const CACHE = "casca-v4";
const CASCA = ["/", "/css/tokens.css", "/css/components.css", "/css/app.css", "/js/app.js", "/js/base.js", "/js/dados.js", "/js/calculos.js", "/js/icones.js",
  "/js/tela-inicio.js", "/js/tela-cartoes.js", "/js/tela-planejar.js", "/js/tela-mais.js",
  "/assets/monograma.svg", "/assets/marca-horizontal.svg", "/assets/padrao.svg", "/assets/apple-touch-icon.png", "/manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Rede primeiro; o cache só entra quando não há conexão.
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("/"))));
});
