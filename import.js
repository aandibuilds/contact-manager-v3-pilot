import {empty,freshRecord,validate,validateNote,UUID} from './model.js';
async function stableId(text){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;}
export async function prepareImport(raw){
 if(raw?.format==='contact-manager-v3'&&raw.version===1){
  const contacts={},notes={};
  for(const [id,r] of Object.entries(raw.workspace?.contacts||{})){
   if(!UUID.test(id))throw Error('Invalid backup contact ID.');
   contacts[id]=freshRecord(validate(r.draft),id);
  }
  for(const [id,n] of Object.entries(raw.workspace?.notes||{})){if(!contacts[n.contact_id]||typeof n.body!=='string'||!n.body.trim()||!n.id||n.id!==id)throw Error('Invalid backup history.');notes[id]=validateNote(n);}
  return {contacts,notes,source:'V3 backup (existing IDs skipped)',legacyAudit:Array.isArray(raw.workspace.audit)?raw.workspace.audit:[]};
 }
 if(!Array.isArray(raw?.contacts)||!Array.isArray(raw.interactions)||!Array.isArray(raw.integrations))throw Error('Choose a Contact Manager V2 JSON export or V3 backup.');
 const contacts={},notes={},map={};
 for(const old of raw.contacts){
  if(!Number.isInteger(old.id)||typeof old.created_at!=='string')throw Error('Invalid V2 contact identity.');
  const id=await stableId('v2:'+old.id+':'+old.created_at);map[old.id]=id;
  const d=empty();for(const k of Object.keys(d))if(typeof d[k]==='string')d[k]=old[k]??d[k];
  d.followup={action:old.next_action||'',date:old.next_action_date||'',status:old.followup_status||'new',owner:'me'};
  contacts[id]=freshRecord(d,id);
 }
 for(const n of [...raw.interactions.map(x=>({...x,source:'interaction'})),...raw.integrations.map(x=>({...x,source:'integration'}))]){
  const cid=map[n.contact_id];if(!cid)throw Error('History references a missing contact.');
  const id=await stableId(`v2:${cid}:${n.source}:${n.id}`);
  notes[id]={id,contact_id:cid,kind:'legacy',body:n.source==='integration'?`Imported Google history (not replayed): ${JSON.stringify(n)}`:`Imported ${n.kind}: ${n.note||'(no text)'}`,occurred_at:n.occurred_at||n.created_at||'',synced:false};
 }
 return {contacts,notes,source:'V2 JSON export',legacyAudit:[]};
}
