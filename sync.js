import {read,mutate} from './store.js';
import {attemptFor,accept,changed,mergePulled} from './model.js';
export async function synchronize(key,cloud,notify=()=>{}){
 const run=async()=>{
  const start=await read(key);
  // One pass per run; subsequent local edits stay queued for the next run.
  for(const id of Object.keys(start.contacts)){
   let op;
   await mutate(key,s=>{const r=s.contacts[id];if(!r||r.conflict||(!r.attempt&&!changed(r.base?.data,r.draft).length))return;r.attempt=attemptFor(r);op=structuredClone(r.attempt);});
   if(!op)continue;
   const result=await cloud.rpc('cm_apply',{op});
   await mutate(key,s=>{const r=s.contacts[id];if(r?.attempt?.op_id===op.op_id){s.contacts[id]=accept(r,result);if(s.contacts[id].conflict)s.audit.push({at:new Date().toISOString(),type:'conflict',contact_id:id,local:r.draft,remote:result.contact});}});
   notify();
  }
  const withNotes=await read(key);
  for(const note of Object.values(withNotes.notes)){
   if(note.synced||!withNotes.contacts[note.contact_id]?.base)continue;
   const {synced,...payload}=note;
   await cloud.rpc('cm_add_note',{note:payload});
   await mutate(key,s=>{if(s.notes[note.id])s.notes[note.id].synced=true;});
  }
  const contacts=await cloud.list('cm_contacts');
  const notes=await cloud.list('cm_notes');
  await mutate(key,s=>{for(const c of contacts)s.contacts[c.id]=mergePulled(s.contacts[c.id],c);for(const n of notes)s.notes[n.id]={id:n.id,contact_id:n.contact_id,kind:n.kind,body:n.body,occurred_at:n.occurred_at,synced:true};s.lastSync=new Date().toISOString();});
  notify();
 };
 // One synchronization pass across browser tabs; local saves use IDB transactions.
 if(!navigator.locks)throw Error('This browser lacks safe cross-tab synchronization. Use a current Safari, Chrome, or Firefox. Local edits are saved.');
 return navigator.locks.request('cm-v3-sync:'+key,run);
}
