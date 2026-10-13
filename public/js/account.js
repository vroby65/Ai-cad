const storageKey='aicad.api-key',urlKey='aicad.gateway-url';
export function readKey(storage) {
  try { return (storage??globalThis.localStorage).getItem(storageKey)??''; }
  catch { return ''; }
}
export function rememberKey(storage,key) {
  try {
    const local=storage??globalThis.localStorage,value=key.trim();
    if(value) local.setItem(storageKey,value); else local.removeItem(storageKey);
    return true;
  } catch { return false; }
}
export function readURL(storage) {
  try { return (storage??globalThis.localStorage).getItem(urlKey)??''; }
  catch { return ''; }
}
export function rememberURL(storage,url) {
  try {
    const local=storage??globalThis.localStorage,value=url.trim();
    if(value) local.setItem(urlKey,value); else local.removeItem(urlKey);
    return true;
  } catch { return false; }
}
