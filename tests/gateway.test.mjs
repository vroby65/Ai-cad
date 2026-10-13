import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../public/js/api.js';
import * as account from '../public/js/account.js';
import {emptyProject} from '../public/js/state.js';

test('Gateway URL and API key have separate browser storage; clearing preserves unrelated data',()=>{
  const values=new Map([['deepcad.deepseek-key','old-provider-key'],['project','keep']]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  assert.equal(account.readKey(storage),'');
  assert.equal(account.rememberURL(storage,'http://192.168.1.10:18765'),true);
  assert.equal(account.readURL(storage),'http://192.168.1.10:18765');
  account.rememberKey(storage,'fake-gateway-key');
  account.rememberKey(storage,'');
  assert.equal(account.readURL(storage),'http://192.168.1.10:18765');
  assert.equal(values.get('deepcad.deepseek-key'),'old-provider-key');
  assert.equal(values.get('project'),'keep');
});
test('Gateway URLs accept LAN address and port but reject credentials, queries and unsafe protocols',()=>{
  assert.equal(api.gatewayURL('192.168.1.10:18765/'),'http://192.168.1.10:18765');
  assert.equal(api.gatewayURL('https://gateway.example/v1/'),'https://gateway.example');
  for(const url of ['', 'javascript:alert(1)', 'ftp://gateway.example', 'https://key@gateway.example', 'https://gateway.example/?key=secret']) assert.throws(()=>api.gatewayURL(url));
});
test('Gateway catalog chooses an account model and Responses uses the selected URL and header key',async t=>{
  const requests=[];
  const reply={message:'Created a red cube.',operations:[{op:'create',object:{id:'cube',name:'Red cube',type:'box',dimensions:{x:10,y:10,z:10},position:[0,0,5],rotation:[0,0,0],color:'#ff0000',groupId:null}}]};
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify(url.endsWith('/models')?{models:[{slug:'hidden',visibility:'hide'},{slug:'account-model',visibility:'list',display_name:'Account model'}]}:{model:'account-model',output_text:JSON.stringify(reply)}));
  });
  const url='http://192.168.1.10:18765',key='fake-gateway-key';
  const models=await api.getModels(url,key);
  assert.equal(models[0].id,'account-model');
  const result=await api.interpretAI('Draw a red cube.',emptyProject(),null,{url,key,model:models[0].id});
  assert.deepEqual(result,reply);
  assert.deepEqual(requests.map(r=>r.url),[url+'/v1/models',url+'/v1/responses']);
  for(const {options} of requests) {
    assert.equal(options.headers.Authorization,'Bearer '+key);
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');
    assert.equal(options.referrerPolicy,'no-referrer');
  }
  const payload=JSON.parse(requests[1].options.body);
  assert.equal(payload.model,'account-model');
  assert.ok(Array.isArray(payload.input));
  assert.match(payload.instructions,/English/);
  assert.equal(JSON.stringify(payload).includes(key),false);
  for(const name of ['thinking','messages','max_tokens','max_output_tokens','temperature','response_format']) assert.equal(name in payload,false);
});
