export const fields = ['name','company','role','email','phone','where_met','met_date','links','contact_types','warmth','warmth_reason','context_notes','tags','followup','deleted'];
export const empty = () => Object.fromEntries(fields.map(k=>[k,k==='followup'?{action:'',date:'',status:'new',owner:'me'}:k==='deleted'?false:k==='warmth'?'unrated':'']));
const canonical=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]))):v;
export const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const copy=x=>structuredClone(x);
export function validate(data){
  if(!data || typeof data!=='object' || Array.isArray(data)) throw Error('Invalid contact.');
  if(Object.keys(data).some(k=>!fields.includes(k))) throw Error('Unknown contact field.');
  const d={...empty(),...data};
  for(const k of fields.filter(k=>!['followup','deleted'].includes(k))) if(typeof d[k]!=='string'||d[k].length>10000) throw Error(`Invalid ${k}.`);
  if(!d.name.trim() || d.name.length>200) throw Error('Enter a name (up to 200 characters).');
  if(!['unrated','cold','warm','hot'].includes(d.warmth)||typeof d.deleted!=='boolean') throw Error('Invalid relationship fields.');
  const f=d.followup;
  if(!f||Object.keys(f).sort().join(',')!=='action,date,owner,status'||typeof f.action!=='string'||f.action.length>10000||typeof f.date!=='string'||!['me','them'].includes(f.owner)||!['new','pending','sent','replied','scheduled','closed','done'].includes(f.status)) throw Error('Invalid follow-up.');
  for(const date of [d.met_date,f.date]) if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)) throw Error('Enter a valid date.');
  return d;
}
export function changed(base,desired){return fields.filter(k=>!equal(base?.[k],desired[k]));}
export function freshRecord(data,id=crypto.randomUUID()){return {id,base:null,draft:validate(data),attempt:null,conflict:null};}
export function attemptFor(r){return r.attempt||{op_id:crypto.randomUUID(),contact_id:r.id,base_revision:r.base?.revision||0,desired:copy(r.draft),changed:changed(r.base?.data,r.draft)};}
// Preserve edits made locally after an immutable attempt was dispatched.
export function accept(r,result){
 const sent=r.attempt;
 if(result.status==='conflict'){r.conflict=copy(result);return r;}
 const later=changed(sent.desired,r.draft);
 const draft=copy(result.contact.data),conflicts=[];
 for(const k of later){
  // A later local edit was authored before this acknowledgement, not against
  // unrelated remote changes that the accepted operation happened to merge.
  if((result.contact.field_versions[k]||0)>sent.base_revision && !equal(result.contact.data[k],sent.desired[k]) && !equal(result.contact.data[k],r.draft[k]))conflicts.push(k);
  draft[k]=copy(r.draft[k]);
 }
 if(later.length && result.contact.data.deleted!==sent.desired.deleted)conflicts.splice(0,conflicts.length,'$record');
 return {...r,base:copy(result.contact),draft,attempt:null,conflict:conflicts.length?{status:'conflict',contact:copy(result.contact),fields:conflicts}:null};
}
export function resolve(r,choices){
 if(!r.conflict)throw Error('No conflict to resolve.');
 const remote=r.conflict.contact;
 if(!remote)throw Error('Contact missing from server. Export your data before retrying.');
 const mine=copy(r.draft); let next=copy(remote.data);
 for(const k of changed(r.base?.data,mine)) next[k]=mine[k];
 for(const key of r.conflict.fields){
  if(!['mine','remote'].includes(choices[key]))throw Error('Choose a version for every conflict.');
  if(key==='$record'){next=copy(choices[key]==='remote'?remote.data:mine);}
  else next[key]=choices[key]==='mine'?mine[key]:copy(remote.data[key]);
 }
 return {...r,base:copy(remote),draft:validate(next),attempt:null,conflict:null};
}
// Reference model for protocol testing; production authority is the SQL transaction.
export function serverMerge(current,op){
 const desired=validate(op.desired);
 if(!current){if(op.base_revision!==0)return {status:'conflict',contact:null,fields:['$record']};return {status:'ok',contact:{id:op.contact_id,revision:1,data:desired,field_versions:Object.fromEntries(fields.map(k=>[k,1]))}};}
 const keys=op.changed, conflict=[];
 if(op.base_revision>current.revision)throw Error('Future revision.');
 if(op.base_revision===0 || ((keys.includes('deleted')||current.data.deleted)&&(op.base_revision!==current.revision)))conflict.push('$record');
 for(const k of conflict.length?[]:keys)if(current.field_versions[k]>op.base_revision&&!equal(current.data[k],desired[k]))conflict.push(k);
 if(conflict.length)return {status:'conflict',contact:copy(current),fields:[...new Set(conflict)]};
 const c=copy(current);c.revision++;
 for(const k of keys){if(!equal(c.data[k],desired[k]))c.field_versions[k]=c.revision;c.data[k]=copy(desired[k]);}
 validate(c.data);return {status:'ok',contact:c};
}
export function mergePulled(local,remote){
 if(!local)return {id:remote.id,base:copy(remote),draft:copy(remote.data),attempt:null,conflict:null};
 if(!local.attempt&&!local.conflict&&changed(local.base?.data,local.draft).length===0&&remote.revision>=(local.base?.revision||0))return {...local,base:copy(remote),draft:copy(remote.data)};
 return local;
}

export function validateNote(n){
 if(!n||typeof n!=='object'||typeof n.id!=='string'||!UUID.test(n.id)||typeof n.contact_id!=='string'||!UUID.test(n.contact_id)||!['note','met','email','linkedin','call','text','other','legacy'].includes(n.kind)||typeof n.body!=='string'||!n.body.trim()||n.body.length>20000||typeof n.occurred_at!=='string'||!n.occurred_at||n.occurred_at.length>100)throw Error('Invalid history entry.');
 return {id:n.id,contact_id:n.contact_id,kind:n.kind,body:n.body,occurred_at:n.occurred_at,synced:false};
}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
