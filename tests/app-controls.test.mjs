import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

class Element extends EventTarget {
  constructor(){super();this.children=[];this.attributes={};this.value='';this.className='';this.disabled=false;this.clientHeight=600;this.offsetHeight=8;this.scrollHeight=500;this.style={setProperty(){}};}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return (this.text||'')+this.children.map(child=>child.textContent).join('');}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  replaceChildren(...children){this.text='';this.children=[];this.append(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getBoundingClientRect(){return {height:240,width:800};}
  get classList(){return {remove:name=>{this.className=this.className.split(' ').filter(part=>part!==name).join(' ');},add:name=>{this.className+=' '+name;},toggle:name=>{if(this.className.includes(name)){this.className=this.className.replace(name,'');return false;}this.className+=' '+name;return true;}};}
  focus(){this.focused=true;}
  click(){this.dispatchEvent(new Event('click'));}
  remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const cube={id:'cube',type:'box',name:'Cubo',dimensions:{x:100,y:100,z:100},position:[0,0,50],rotation:[0,0,0],color:'#ff0000',groupId:null};
const response=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({message:'Ho creato un cubo.',operations:[{op:'create',object:cube}]})}}]}));
let instance=0;
async function setup(t){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const storage=new Map([['aicad.api-key','fake-test-key'],['aicad.gateway-url','https://gateway.example'],['unrelated','keep']]),requests=[];
  const env={get,storage,requests,gatewayRequests:[],confirmations:0,accept:true,hold:false,reply:response};let release;
  const window=new EventTarget();
  t.after(async()=>{if(release){release();await env.idle();}window.dispatchEvent(new Event('pagehide'));});
  const globals={document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]},window,ResizeObserver:class{observe(){}},matchMedia:()=>({matches:false}),localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},confirm:()=>{env.confirmations++;return env.accept;}};
  for(const [key,value] of Object.entries(globals)){
    const existed=Object.hasOwn(globalThis,key),previous=globalThis[key];globalThis[key]=value;
    t.after(()=>{if(existed)globalThis[key]=previous;else delete globalThis[key];});
  }
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    env.gatewayRequests.push({url,authorization:options.headers.Authorization});
    if(url.endsWith('/models'))return new Response(JSON.stringify({models:[{slug:'test-model',visibility:'list'}]}));
    requests.push(JSON.parse(options.body));
    if(env.hold)return new Promise(resolve=>{release=()=>resolve(env.reply());});
    return env.reply();
  });
  // Execute the actual app; only the WebGL view is replaced for headless testing.
  const view='data:text/javascript;base64,'+Buffer.from('export class CadView { prepare(){} sync(){} select(){} frame(){} }').toString('base64');
  let source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
  source=source.replace(/from '\.\/([^']+)'/g,(_,name)=>`from '${name==='renderer.js'?view:new URL('../public/js/'+name,import.meta.url).href}'`);
  await import('data:text/javascript;base64,'+Buffer.from(source+'\n// instance '+instance++).toString('base64'));
  await new Promise(resolve=>setTimeout(resolve,10));
  env.release=()=>release();
  env.submit=()=>get('command-form').dispatchEvent(new Event('submit',{cancelable:true}));
  env.key=properties=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:'Enter',...properties});get('prompt').dispatchEvent(event);return event;};
  env.idle=async()=>{for(let i=0;i<1000&&get('run').disabled;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(get('run').disabled,false);};
  return env;
}
test('Invio invia il prompt una sola volta; Maiusc+Invio e composizione IME non inviano',async t=>{
  const env=await setup(t),{get,key,requests}=env;get('prompt').value='Crea un cubo';
  assert.equal(key({shiftKey:true}).defaultPrevented,false);assert.equal(key({isComposing:true}).defaultPrevented,false);assert.equal(key({keyCode:229}).defaultPrevented,false);assert.equal(requests.length,0);
  assert.equal(key({}).defaultPrevented,true);key({});assert.equal(requests.length,1);
  await env.idle();assert.equal(get('object-count').textContent,'1');assert.equal(get('prompt').value,'');assert.equal(get('undo').disabled,false);
});
test('Nuovo chiede conferma, può annullarsi e azzera scena, selezione, chat, bozza e cronologia senza toccare la chiave',async t=>{
  const env=await setup(t),{get}=env;get('prompt').value='Crea un cubo';env.submit();await env.idle();
  get('objects').children[0].click();assert.equal(get('properties').hidden,false);get('prompt').value='Bozza';
  env.accept=false;get('new').click();assert.equal(env.confirmations,1);assert.equal(get('object-count').textContent,'1');assert.equal(get('prompt').value,'Bozza');assert.equal(get('undo').disabled,false);
  env.accept=true;get('new').click();assert.equal(env.confirmations,2);assert.equal(get('object-count').textContent,'0');assert.equal(get('properties').hidden,true);assert.equal(get('welcome').hidden,false);
  assert.equal(get('undo').disabled,true);assert.equal(get('redo').disabled,true);assert.equal(get('prompt').value,'');assert.equal(get('prompt').focused,true);
  assert.equal(get('chat-messages').children[0].className,'chat-empty');assert.equal(get('api-key').value,'fake-test-key');assert.equal(env.storage.get('unrelated'),'keep');assert.equal(env.storage.get('aicad.api-key'),'fake-test-key');
  get('prompt').value='Crea un cubo';env.submit();await env.idle();const payload=env.requests.at(-1);assert.equal(payload.input.length,1);const context=JSON.parse(payload.input.at(-1).content);assert.equal(context.selectedId,null);assert.deepEqual(context.project.objects,[]);
});
test('Nuovo non cancella una richiesta in corso; un progetto vuoto si apre senza conferma',async t=>{
  const env=await setup(t),{get}=env;get('new').click();assert.equal(env.confirmations,0);assert.equal(get('object-count').textContent,'0');
  env.hold=true;get('prompt').value='Crea un cubo';env.submit();assert.equal(get('new').disabled,true);
  get('new').click();assert.equal(env.confirmations,0);assert.equal(get('chat-messages').children[0].className,'chat-turn');
  env.release();await env.idle();assert.equal(get('new').disabled,false);assert.equal(get('object-count').textContent,'1');
});

test('Un comando fallito lascia log leggibili e scaricabili senza chiave; il successivo riesce',async t=>{
  const env=await setup(t),{get}=env;
  env.reply=()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"operations":[',reasoning_content:'private-reasoning'}}],usage:{completion_tokens:8192}}));
  get('prompt').value='Crea un cubo';env.submit();await env.idle();
  assert.equal(get('object-count').textContent,'0');assert.equal(get('diagnostics').open,true);
  const raw=get('diagnostic-output').textContent,log=JSON.parse(raw);
  assert.ok(log.entries.some(e=>e.stage==='response'&&e.data.finishReason==='length'));
  assert.match(raw,/truncated/);assert.doesNotMatch(raw,/fake-test-key|private-reasoning/);
  let download;t.mock.method(URL,'createObjectURL',blob=>{download=blob;return 'blob:test';});get('download-log').click();
  assert.deepEqual(JSON.parse(await download.text()),log);
  env.reply=response;env.submit();await env.idle();assert.equal(get('object-count').textContent,'1');
  assert.ok(JSON.parse(get('diagnostic-output').textContent).entries.some(e=>e.stage==='applied'));
  get('clear-log').click();assert.equal(JSON.parse(get('diagnostic-output').textContent).entries.length,0);
  assert.equal(get('api-key').value,'fake-test-key');
});


test('Changing gateway URL retargets requests; Clear forgets only the key',async t=>{
  const env=await setup(t),{get,storage}=env;
  get('gateway-url').value='https://other-gateway.example';
  get('gateway-url').dispatchEvent(new Event('input'));
  assert.equal(storage.get('aicad.gateway-url'),'https://other-gateway.example');
  get('prompt').value='Draw a cube';env.submit();await env.idle();
  assert.ok(env.gatewayRequests.some(r=>r.url==='https://other-gateway.example/v1/responses'&&r.authorization==='Bearer fake-test-key'));
  get('clear-key').click();
  assert.equal(get('api-key').value,'');assert.equal(storage.has('aicad.api-key'),false);
  assert.equal(get('gateway-url').value,'https://other-gateway.example');
  assert.equal(storage.get('unrelated'),'keep');
  assert.equal(get('gateway-status').textContent,'Gateway: not connected');
});
