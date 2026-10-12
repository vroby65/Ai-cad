import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOperations,validateProject} from '../public/js/project.js';
import {emptyProject,History} from '../public/js/state.js';
import {encodeProject,decodeProject} from '../public/js/files.js';
import {exportSTL} from '../public/js/export.js';
import {interpretDeepSeek} from '../public/js/api.js';
const box=(id,dimensions,position)=>({id,type:'box',name:id,dimensions:{x:dimensions[0],y:dimensions[1],z:dimensions[2]},position,rotation:[0,0,0],color:'#f2c94c',groupId:'bus-group'});
const objects=[box('bus-body',[900,250,300],[0,0,180]),box('bus-window-left',[700,2,120],[0,126,220]),box('bus-window-right',[700,2,120],[0,-126,220]),box('bus-windshield',[2,220,140],[451,0,220]),box('bus-stripe-left',[900,4,30],[0,128,100]),box('bus-stripe-right',[900,4,30],[0,-128,100]),box('bus-bumper-front',[20,250,50],[460,0,60]),box('bus-bumper-rear',[20,250,50],[-460,0,60])];
for(const [id,x,y] of [['bus-wheel-fl',300,125],['bus-wheel-fr',300,-125],['bus-wheel-rl',-300,125],['bus-wheel-rr',-300,-125]])objects.push({...box(id,[1,1,1],[x,y,55]),type:'cylinder',dimensions:{radius:55,height:40},rotation:[90,0,0],color:'#333333'});
const group={op:'group',id:'bus-group',name:'Bus',ids:objects.map(o=>o.id)};
const operations=[...objects.map(object=>({op:'create',object})),group];

test('Il batch autobus con 12 pezzi assegnati al gruppo creato alla fine si applica, salva e produce STL',()=>{
  const source=emptyProject(),snapshot=structuredClone(operations),result=applyOperations(source,{operations});
  assert.equal(result.objects.length,12);assert.deepEqual(result.groups,[{id:'bus-group',name:'Bus'}]);assert.ok(result.objects.every(o=>o.groupId==='bus-group'));
  assert.deepEqual(result.objects,objects);assert.deepEqual(operations,snapshot);assert.equal(source.objects.length,0);
  assert.deepEqual(decodeProject(encodeProject(result)),result);assert.ok(exportSTL(result).getUint32(80,true)>500);
  const history=new History(source);history.commit(result);assert.deepEqual(history.undo(),source);assert.deepEqual(history.redo(),result);
});

test('Gruppi assenti, non dichiarati come membri, malformati o duplicati restano errori atomici',()=>{
  const object=objects[0],source=emptyProject(),copy=structuredClone(source);
  for(const batch of [[{op:'create',object}],[{op:'create',object},{...group,ids:['other']}],[{op:'create',object},{...group,ids:[object.id],extra:true}],[{op:'create',object},{...group,ids:[object.id],name:''}],[{op:'create',object},{...group,ids:[object.id]},{...group,ids:[object.id]}],[{op:'create',object:{...object,dimensions:{x:-1,y:1,z:1}}},{...group,ids:[object.id]}]])assert.throws(()=>applyOperations(source,{operations:batch}));
  assert.deepEqual(source,copy);assert.throws(()=>validateProject({...source,objects:[object]}),/Gruppo inesistente/);
});

test('Riferimenti futuri non creano gruppi in anticipo; gruppi già esistenti mantengono la propria semantica',()=>{
  const create={op:'create',object:objects[0]},single={...group,ids:[objects[0].id]};
  assert.throws(()=>applyOperations(emptyProject(),{operations:[create,{op:'translate',ids:['bus-group'],delta:[10,0,0]},single]}));
  const existing=applyOperations(emptyProject(),{operations:[create,single]});
  const result=applyOperations(existing,{operations:[{op:'create',object:objects[1]}]});assert.equal(result.objects[1].groupId,'bus-group');assert.equal(result.groups.length,1);
});

test('La risposta AI autobus del caso segnalato non fallisce più prima della creazione del gruppo',async t=>{
  const reply={message:'Creo il bus e raggruppo i pezzi.',operations};
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]})));
  const result=await interpretDeepSeek('Crea un autobus',emptyProject(),null,{key:'fake-test-key'});
  assert.equal(applyOperations(emptyProject(),{operations:result.operations}).objects.length,12);
});
