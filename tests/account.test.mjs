import test from 'node:test';
import assert from 'node:assert/strict';
import { readKey, rememberKey, getBalance } from '../public/js/account.js';
const balance={is_available:true,balance_infos:[{currency:'USD',total_balance:'12.3456',granted_balance:'2.0000',topped_up_balance:'10.3456'}]};
function storage() {
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
test('La chiave si conserva tra riaperture e il campo vuoto la dimentica',()=>{
  const local=storage(); assert.equal(readKey(local),'');
  assert.equal(rememberKey(local,' test-not-a-real-key '),true);
  assert.equal(readKey(local),'test-not-a-real-key');
  rememberKey(local,'second-test-key'); assert.equal(readKey(local),'second-test-key');
  local.setItem('unrelated-project','keep');
  rememberKey(local,'   '); assert.equal(readKey(local),'');
  assert.equal(local.getItem('unrelated-project'),'keep');
});
test('Storage bloccato non interrompe la pagina né finge di salvare la chiave',()=>{
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
  assert.equal(readKey(blocked),''); assert.equal(rememberKey(blocked,'test-key'),false);
});
test('Saldo ufficiale via GET: chiave soltanto nell’header, valuta e decimali conservati',async t=>{
  let called;
  t.mock.method(globalThis,'fetch',async(url,options)=>{called={url,options};return new Response(JSON.stringify(balance));});
  assert.deepEqual(await getBalance(' test-key '),{available:true,balances:[{currency:'USD',total:'12.3456'}]});
  assert.equal(called.url,'https://api.deepseek.com/user/balance'); assert.equal(called.options.method,'GET');
  assert.equal(called.options.headers.Authorization,'Bearer test-key'); assert.equal(called.options.body,undefined);
  assert.equal(called.options.credentials,'omit'); assert.equal(called.options.redirect,'error');
});
test('Saldo zero e più valute non vengono confusi con un errore o sommati',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({is_available:false,balance_infos:[{currency:'USD',total_balance:'0.00'},{currency:'CNY',total_balance:'0.0000'}]})));
  assert.deepEqual(await getBalance('test-key'),{available:false,balances:[{currency:'USD',total:'0.00'},{currency:'CNY',total:'0.0000'}]});
});
test('Saldo malformato, HTML e body eccessivi sono rifiutati',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('{}'));
  for(const response of [{},null,{...balance,is_available:'true'},{...balance,balance_infos:[{currency:'EUR',total_balance:'1.00'}]},{...balance,balance_infos:[{currency:'USD',total_balance:'<script>'}]},{...balance,balance_infos:[{currency:'USD',total_balance:'Infinity'}]}]) {
    globalThis.fetch=async()=>new Response(JSON.stringify(response)); await assert.rejects(()=>getBalance('test-key'));
  }
  globalThis.fetch=async()=>new Response('<html>error</html>'); await assert.rejects(()=>getBalance('test-key'));
  globalThis.fetch=async()=>new Response('x'.repeat(512*1024+1)); await assert.rejects(()=>getBalance('test-key'),/troppo grande/);
});
test('Errori saldo non espongono dettagli provider o chiavi',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('test-key private-detail',{status:401}));
  await assert.rejects(()=>getBalance('test-key'),error=>/chiave API non valida/.test(error.message)&&!error.message.includes('test-key')&&!error.message.includes('private-detail'));
  globalThis.fetch=async()=>{throw new TypeError('network');}; await assert.rejects(()=>getBalance('test-key'),/Connessione/);
  globalThis.fetch=async()=>{throw new DOMException('timeout','AbortError');}; await assert.rejects(()=>getBalance('test-key'),/10 secondi/);
});
test('Chiave assente, multilinea o richiesta annullata non causano chiamate al saldo',async t=>{
  let calls=0; t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify(balance));});
  for(const key of ['',null,'test\nkey']) await assert.rejects(()=>getBalance(key));
  const controller=new AbortController(); controller.abort(); await assert.rejects(()=>getBalance('test-key',controller.signal));
  assert.equal(calls,0);
});
test('Cambiare chiave può annullare una richiesta saldo già in corso',async t=>{
  let requestSignal;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    requestSignal=options.signal;
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
  });
  const controller=new AbortController(),pending=getBalance('test-key',controller.signal);
  controller.abort();
  await assert.rejects(()=>pending,error=>error.name==='AbortError');
  assert.equal(requestSignal.aborted,true);
});
