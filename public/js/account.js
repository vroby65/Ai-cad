import { readResponse } from './api.js';

const storageKey='deepcad.deepseek-key';
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
export async function getBalance(key,signal) {
  if(typeof key!=='string' || !key.trim() || /[\r\n]/.test(key)) throw new Error('Chiave API non valida.');
  if(signal?.aborted) throw new DOMException('Richiesta annullata.','AbortError');
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,10000);
  try {
    const response=await fetch('https://api.deepseek.com/user/balance',{
      method:'GET',headers:{Authorization:`Bearer ${key.trim()}`},signal:controller.signal,
      credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'
    });
    if(!response.ok) {
      const errors={401:'chiave API non valida',403:'accesso negato',429:'troppe richieste; riprova tra poco'};
      throw new Error(`Credito: ${errors[response.status]||'servizio non disponibile'} (HTTP ${response.status}).`);
    }
    const data=await readResponse(response);
    if(typeof data?.is_available!=='boolean' || !Array.isArray(data.balance_infos) || !data.balance_infos.length) throw new Error('Risposta del credito non valida.');
    const balances=data.balance_infos.map(info=>{
      if(!['USD','CNY'].includes(info?.currency) || typeof info.total_balance!=='string' || info.total_balance.length>80 || !/^-?\d+(\.\d+)?$/.test(info.total_balance) || !Number.isFinite(Number(info.total_balance))) throw new Error('Risposta del credito non valida.');
      return {currency:info.currency,total:info.total_balance};
    });
    return {available:data.is_available,balances};
  } catch(error) {
    if(signal?.aborted) throw new DOMException('Richiesta annullata.','AbortError');
    if(error.name==='AbortError') throw new Error('Credito non disponibile: timeout di 10 secondi.');
    if(error instanceof TypeError) throw new Error('Connessione al credito DeepSeek non riuscita. Controlla rete e accesso CORS.');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort',abort); controller.abort(); }
}
