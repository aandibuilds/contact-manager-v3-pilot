export function configCheck(c){
 const url=new URL(c.url);if(url.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(url.hostname)||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('Use your https://PROJECT.supabase.co project URL.');
 let safe=c.key.startsWith('sb_publishable_');
 if(c.key.startsWith('eyJ')){try{safe=JSON.parse(atob(c.key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{}}
 if(!safe)throw Error('Use a publishable or legacy anon key, never a secret/service-role key.');
 return {url:url.origin,key:c.key.trim()};
}
export class Cloud {
 constructor(config){this.config=configCheck(config);this.key=`cm-v3-session:${this.config.url}`;this.session=JSON.parse(localStorage.getItem(this.key)||'null');this.userId=this.session?.user?.id;}
 async call(path,body,token){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{const r=await fetch(this.config.url+path,{method:body===undefined?'GET':'POST',headers:{apikey:this.config.key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:ctl.signal});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(r.status===401?'Session expired. Sign in again; local edits are safe.':d.message||d.error_description||d.msg||`Cloud request failed (${r.status}).`);return d;}catch(e){if(e.name==='AbortError')throw Error('Sync timed out. Local edits are safe; retry when online.');throw e;}finally{clearTimeout(timer);}
 }
 save(s){s.expires_at=s.expires_at||Math.floor(Date.now()/1000)+s.expires_in;this.session=s;localStorage.setItem(this.key,JSON.stringify(s));}
 async signin(email,password){const s=await this.call('/auth/v1/token?grant_type=password',{email,password});this.userId=s.user.id;this.save(s);return s.user;}
 async token(){
 const get=async()=>{
  const latest=JSON.parse(localStorage.getItem(this.key)||'null');
  if(!latest||latest.user?.id!==this.userId)throw Error('Account changed or signed out in another tab. Sign in again; local edits are safe.');
  this.session=latest;
  if(this.session.expires_at*1000<Date.now()+60000){
   const s=await this.call('/auth/v1/token?grant_type=refresh_token',{refresh_token:this.session.refresh_token});
   const still=JSON.parse(localStorage.getItem(this.key)||'null');
   if(!still||still.user?.id!==this.userId)throw Error('Account changed during refresh. Sign in again.');
   this.save(s);
  }
  return this.session.access_token;
 };
 if(!navigator.locks)throw Error('Use a current browser with safe cross-tab sync support.');
 return navigator.locks.request('cm-v3-auth:'+this.config.url,get);
 }
 async rpc(name,args){return this.call('/rest/v1/rpc/'+name,args,await this.token());}
 async list(table){const all=[];for(let offset=0;;offset+=500){const page=await this.call(`/rest/v1/${table}?select=*&order=id&limit=500&offset=${offset}`,undefined,await this.token());all.push(...page);if(page.length<500)break;}return all;}
 signout(){this.session=null;localStorage.removeItem(this.key);}
}
