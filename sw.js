// Funciona offline: guarda os arquivos do app em cache (dados já ficam no localStorage).
const C='cn-v4',F=['app.html','index.html','vitrine.html','css/style.css','js/db.js','js/app.js','js/importar.js','js/sync.js','vendor/sql-wasm.js','vendor/sql-wasm.wasm','manifest.json','assets/logo.jpg','assets/icon-192.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||e.request.url.includes('/api/'))return;e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request)))});
