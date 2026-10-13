import test from 'node:test';
import assert from 'node:assert/strict';
import {readKey,rememberKey,readURL,rememberURL} from '../public/js/account.js';
import {getModels} from '../public/js/api.js';
const url='https://gateway.example',key='fake-test-key';
test('Key and URL persist separately; blocked browser storage does not break the app',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 assert.equal(readKey(storage),'');assert.equal(readURL(storage),'');
 rememberKey(storage,' '+key+' ');rememberURL(storage,url);
 assert.equal(readKey(storage),key);assert.equal(readURL(storage),url);
 values.set('unrelated','keep');rememberKey(storage,'');assert.equal(readKey(storage),'');assert.equal(readURL(storage),url);assert.equal(values.get('unrelated'),'keep');
 rememberURL(storage,'');assert.equal(readURL(storage),'');
 const blocked={getItem(){throw new Error();},setItem(){throw new Error();},removeItem(){throw new Error();}};
 assert.equal(readKey(blocked),'');assert.equal(readURL(blocked),'');assert.equal(rememberKey(blocked,key),false);assert.equal(rememberURL(blocked,url),false);
});
test('Catalog supports gateway account models and standard OpenAI model IDs',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({data:[{id:'model-1'}]})));
 assert.deepEqual(await getModels(url,key),[{id:'model-1',name:'model-1'}]);
 for(const body of [{},null,{models:[{slug:'hidden',visibility:'hide'}]},{data:[{id:12}]}]) {
  globalThis.fetch=async()=>new Response(JSON.stringify(body));await assert.rejects(()=>getModels(url,key));
 }
 globalThis.fetch=async()=>new Response('x'.repeat(512*1024+1));await assert.rejects(()=>getModels(url,key),/too large/);
});
test('Catalog errors do not expose provider details or keys',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(key+' private-detail',{status:401}));
 await assert.rejects(()=>getModels(url,key),e=>/invalid API key/.test(e.message)&&!e.message.includes(key)&&!e.message.includes('private-detail'));
 globalThis.fetch=async()=>{throw new TypeError('network');};await assert.rejects(()=>getModels(url,key),/Cannot connect/);
 globalThis.fetch=async()=>{throw new DOMException('timeout','AbortError');};await assert.rejects(()=>getModels(url,key),/10 seconds/);
});
test('Invalid credentials and cancelled requests do not fetch models; pending requests can be aborted',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('{}');});
 for(const bad of ['',null,'test\nkey'])await assert.rejects(()=>getModels(url,bad));
 const controller=new AbortController();controller.abort();await assert.rejects(()=>getModels(url,key,controller.signal));assert.equal(calls,0);
 globalThis.fetch=async(u,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
 const next=new AbortController(),pending=getModels(url,key,next.signal);next.abort();await assert.rejects(()=>pending,e=>e.name==='AbortError');
});
