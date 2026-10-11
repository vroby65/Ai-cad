import { MAX_PROJECT_BYTES } from './limits.js';
import { validateProject } from './project.js';
export const MAX_FILE_BYTES=MAX_PROJECT_BYTES;
export function encodeProject(state) {
  validateProject(state);
  let raw=JSON.stringify(state,null,2)+'\n';
  if(new TextEncoder().encode(raw).byteLength>MAX_FILE_BYTES) raw=JSON.stringify(state)+'\n';
  if(new TextEncoder().encode(raw).byteLength>MAX_FILE_BYTES) throw new Error('Progetto troppo grande (massimo 8 MiB).');
  return raw;
}
export function decodeProject(raw) {
  if(new TextEncoder().encode(raw).byteLength>MAX_FILE_BYTES) throw new Error('File troppo grande (massimo 8 MiB).');
  let value;
  try { value=JSON.parse(raw); } catch { throw new Error('Il file non contiene JSON valido.'); }
  return validateProject(value);
}
export function download(content, filename, type) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function filename(name,ext) {
  return (name.replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,80)||'deepcad')+'.'+ext;
}
