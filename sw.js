// Funciona offline: guarda os arquivos do app em cache (dados já ficam no localStorage).
const C='crina-v1',F=['app.html','index.html','vitrine.html','css/style.css','js/db.js','js/app.js','manifest.json','icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request))));
