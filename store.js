// ?demo=<name> opens a separate, disposable demo workspace (handy for presentations); real data is untouched.
const demo=new URLSearchParams(location.search).get('demo');
const opened=new Promise((resolve,reject)=>{const req=indexedDB.open('contact-manager-v3'+(demo?'-demo-'+demo.replace(/[^a-z0-9-]/gi,'').slice(0,30):''),1);req.onupgradeneeded=()=>req.result.createObjectStore('workspaces');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export const blank=()=>({contacts:{},notes:{},audit:[],imports:[],event:'',lastSync:null});
export async function read(key){const db=await opened;return new Promise((res,rej)=>{const req=db.transaction('workspaces').objectStore('workspaces').get(key);req.onsuccess=()=>res(req.result||blank());req.onerror=()=>rej(req.error);});}
// Mutation callbacks must be synchronous; IDB serializes cross-tab changes atomically.
export async function mutate(key,fn){const db=await opened;return new Promise((res,rej)=>{const tx=db.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces');let value,error;const get=store.get(key);get.onsuccess=()=>{try{value=get.result||blank();fn(value);store.put(value,key);}catch(e){error=e;tx.abort();}};tx.oncomplete=()=>res(value);tx.onerror=()=>rej(error||tx.error);tx.onabort=()=>rej(error||tx.error||Error('Storage transaction cancelled'));});}
export async function forget(key){const db=await opened;return new Promise((res,rej)=>{const tx=db.transaction('workspaces','readwrite');tx.objectStore('workspaces').delete(key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
