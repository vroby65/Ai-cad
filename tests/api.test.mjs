import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretDeepSeek, parseEnvelope } from '../public/js/api.js';
import { emptyProject } from '../public/js/state.js';
import { importSTL } from '../public/js/import.js';
import { MAX_AI_BYTES } from '../public/js/limits.js';
import { applyOperations } from '../public/js/project.js';
const batch={operations:[{op:'create',object:{id:'cube-1',type:'box',name:'Cubo',dimensions:{x:100,y:100,z:100},position:[0,0,50],rotation:[0,0,0],color:'#ff0000',groupId:null}}]};
const envelope=value=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
test('Richiesta ufficiale JSON con Flash fisso e chiave solo nell’header',async t=>{
  let called;
  t.mock.method(globalThis,'fetch',async (url,options)=>{ called={url,options}; return new Response(JSON.stringify(envelope(batch))); });
  const mesh=importSTL(new TextEncoder().encode('solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid a').buffer,'x.stl','stl-1');
  const state={...emptyProject(),objects:[mesh]};
  const result=await interpretDeepSeek('Crea un cubo',state,null,{key:'test-not-a-real-key'});
  assert.equal(result.operations.length,1); assert.equal(called.url,'https://api.deepseek.com/chat/completions');
  assert.equal(called.options.headers.Authorization,'Bearer test-not-a-real-key');
  const payload=JSON.parse(called.options.body); assert.equal(payload.model,'deepseek-flash');
  assert.deepEqual(payload.response_format,{type:'json_object'});
  assert.ok(payload.messages[0].content.includes('hole:true'));
  assert.ok(payload.messages[0].content.includes('sottrazione reale'));
  assert.equal(called.options.body.includes('test-not-a-real-key'),false);
  const context=JSON.parse(payload.messages[1].content);
  assert.equal(context.project.objects[0].triangleCount,1); assert.equal('vertices' in context.project.objects[0],false);
});
test('DeepSeek può proporre cilindri foro per i vani ruota senza eliminare le ruote',async t=>{
  const {readFile}=await import('node:fs/promises');
  const car=JSON.parse(await readFile(new URL('../public/examples/car.json',import.meta.url),'utf8'));
  const cuts=car.objects.filter(o=>o.groupId==='wheels').map((o,i)=>({...o,id:'wheel-hole-'+i,name:'Vano ruota',hole:true,groupId:'body-with-holes',dimensions:{radius:32,height:40}}));
  const reply={message:'Creo quattro forme foro cilindriche nella carrozzeria e mantengo le ruote.',operations:[{op:'group',id:'body-with-holes',name:'Carrozzeria con fori',ids:['chassis']},...cuts.map(object=>({op:'create',object}))]};
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(envelope(reply))));
  const result=await interpretDeepSeek('Scava i vani ruota nella carrozzeria usando cilindri foro.',car,'chassis',{key:'test-key'});
  const updated=applyOperations(car,{operations:result.operations});
  assert.equal(updated.objects.filter(o=>o.hole).length,4);
  assert.equal(updated.objects.find(o=>o.id==='chassis').groupId,'body-with-holes');
  assert.equal(updated.objects.filter(o=>o.groupId==='wheels'&&!o.hole).length,4);
});
test('Risposte malformate, troncate, non autorizzate e vuote non sono applicate',()=>{
  const empty=emptyProject();
  for(const value of [null,{},[],{choices:{}},{choices:[{finish_reason:'length',message:{content:'{}'}}]},envelope({operations:[{op:'execute',code:'alert(1)'}]}),envelope({operations:[],extra:true})]) assert.throws(()=>parseEnvelope(value,empty));
  for(const content of ['', '```json {} ```','null','[]','{"operations":{}}']) assert.throws(()=>parseEnvelope({choices:[{finish_reason:'stop',message:{content}}]},empty));
  assert.deepEqual(parseEnvelope(envelope({operations:[]}),empty),{operations:[]});
});
test('La risposta chat include una spiegazione italiana senza allentare il contratto geometrico',()=>{
  const reply={message:'Ho creato un cubo rosso di 100 mm, appoggiato sul piano XY.',...batch};
  assert.deepEqual(parseEnvelope(envelope(reply),emptyProject()),reply);
  assert.equal(applyOperations(emptyProject(),{operations:reply.operations}).objects[0].id,'cube-1');
  for(const message of ['',42,'a'.repeat(6001)]) assert.throws(()=>parseEnvelope(envelope({...reply,message}),emptyProject()));
  assert.throws(()=>parseEnvelope(envelope({...reply,code:'alert(1)'}),emptyProject()));
  assert.throws(()=>parseEnvelope(envelope({message:'Fatto',operations:[{op:'execute',code:'alert(1)'}]}),emptyProject()));
  assert.deepEqual(parseEnvelope(envelope({message:'Quale oggetto vuoi spostare?',operations:[]}),emptyProject()),{message:'Quale oggetto vuoi spostare?',operations:[]});
});
test('L’output mostra il contenuto originale DeepSeek prima delle operazioni validate',async t=>{
  const content=JSON.stringify(batch,null,2),state=emptyProject(),seen=[];
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]})));
  const result=await interpretDeepSeek('Crea un cubo',state,null,{key:'test-key',onOutput:value=>{
    seen.push(value); assert.equal(state.objects.length,0);
  }});
  assert.deepEqual(seen,[content]); assert.deepEqual(result,batch);
  assert.equal(applyOperations(state,result).objects.length,1);
});
test('Output malformati o troncati restano leggibili ma non modificano il progetto',async t=>{
  const state=emptyProject(),seen=[];
  for(const [finish_reason,content] of [['stop','<script>alert(1)</script>'],['length','{"operations":['],['stop','{"operations":[{"op":"execute","code":"alert(1)"}]}']]) {
    t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason,message:{content}}]})));
    await assert.rejects(()=>interpretDeepSeek('Crea un cubo',state,null,{key:'test-key',onOutput:value=>seen.push(value)}));
    assert.equal(seen.at(-1),content); assert.equal(state.objects.length,0);
  }
});
test('Errori provider, rete e configurazione sono gestiti senza esporre chiavi',async t=>{
  await assert.rejects(()=>interpretDeepSeek('Crea un cubo',emptyProject(),null,{key:''}));
  t.mock.method(globalThis,'fetch',async()=>new Response('private-provider-detail',{status:401}));
  await assert.rejects(()=>interpretDeepSeek('Crea un cubo',emptyProject(),null,{key:'test-key'}),/chiave API/);
  globalThis.fetch=async()=>{throw new TypeError('network error');};
  await assert.rejects(()=>interpretDeepSeek('Crea un cubo',emptyProject(),null,{key:'test-key'}),/Connessione/);
  globalThis.fetch=async()=>{throw new DOMException('aborted','AbortError');};
  await assert.rejects(()=>interpretDeepSeek('Crea un cubo',emptyProject(),null,{key:'test-key'}),/60 secondi/);
});
test('Il client limita anche il body HTTP e rifiuta envelope non JSON',async t=>{
  const options={key:'test-key'};
  t.mock.method(globalThis,'fetch',async()=>new Response('x'.repeat(MAX_AI_BYTES+1)));
  await assert.rejects(()=>interpretDeepSeek('Crea un cubo',emptyProject(),null,options),/troppo grande/);
  globalThis.fetch=async()=>new Response('<html>upstream error</html>');
  await assert.rejects(()=>interpretDeepSeek('Crea un cubo',emptyProject(),null,options),/non valida/);
});
