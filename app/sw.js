// /app/sw.js
// RControl Factory — SAFE SW (zero risco de tela branca)
// ✅ Troque o arquivo inteiro por este.
// ✅ Não intercepta fetch (não mexe em cache ainda).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // SAFE MODE: não intercepta nada por enquanto.
  // (Quando estiver estável, a gente ativa cache/overrides aqui.)
});
