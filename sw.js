const CACHE='cm-v3-shell-4';
const FILES=['./','index.html','style.css','app.js','api.js','store.js','model.js','sync.js','import.js','manifest.webmanifest','icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cm-v3-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==location.origin)return;
 // Cache only this static shell, never tokens, API responses, or user exports.
 if(!FILES.some(p=>new URL(p,self.registration.scope).href===u.href)&&event.request.mode!=='navigate')return;
 event.respondWith(caches.match(event.request).then(found=>found||fetch(event.request).catch(()=>event.request.mode==='navigate'?caches.match('./'):Response.error())));
});
