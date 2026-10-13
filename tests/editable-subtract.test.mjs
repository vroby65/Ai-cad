import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyOperations, validateProject } from '../public/js/project.js';
import { emptyProject, History } from '../public/js/state.js';
import { encodeProject, decodeProject } from '../public/js/files.js';
import { exportSTL } from '../public/js/export.js';
import { importSTL } from '../public/js/import.js';
import { CadView } from '../public/js/renderer.js';
import { interpretAI } from '../public/js/api.js';
import { explain } from '../public/js/explain.js';

const body={id:'body',type:'box',name:'Corpo',dimensions:{x:100,y:100,z:100},position:[0,0,50],rotation:[0,0,0],color:'#ff0000',groupId:null};
const tool={...body,id:'tool',name:'Foro modificabile',hole:true,dimensions:{x:20,y:20,z:120}};
const project=(objects=[body])=>({...emptyProject(),objects});
const subtract={op:'subtract',ids:['body'],toolIds:['tool']};
const create=object=>({op:'create',object});
const drill=(source=project())=>applyOperations(source,{operations:[create(tool),subtract]});
function volume(state) {
  const data=exportSTL(state);let sum=0;
  for(let i=0;i<data.getUint32(80,true);i++) {
    const v=Array.from({length:9},(_,j)=>data.getFloat32(96+i*50+j*4,true));
    const [a,b,c,d,e,f,g,h,k]=v;sum+=(a*(e*k-f*h)+b*(f*g-d*k)+c*(d*h-e*g))/6;
  }
  return sum;
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1,`${actual} != ${expected}`);

test('Subtract conserva base e foro; spostare o ridimensionare il foro ripristina il vecchio materiale',()=>{
  const drilled=drill();assert.deepEqual(drilled.objects[0],body);
  assert.equal(drilled.objects[1].id,'tool');assert.deepEqual(drilled.objects[1].targetIds,['body']);near(volume(drilled),960000);
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};
  CadView.prototype.sync.call(view,drilled);const mesh=view.meshes.get('body'),oldGeometry=mesh.geometry;
  const ray=x=>new THREE.Raycaster(new THREE.Vector3(x,0,200),new THREE.Vector3(0,0,-1));
  assert.equal(ray(0).intersectObject(mesh).length,0);assert.equal(view.meshes.get('tool').visible,false);
  const moved=applyOperations(drilled,{operations:[{op:'update',id:'tool',changes:{position:[30,0,50]}}]});
  CadView.prototype.sync.call(view,moved);assert.equal(view.meshes.get('body'),mesh);assert.notEqual(mesh.geometry,oldGeometry);
  assert.ok(ray(0).intersectObject(mesh).length);assert.equal(ray(30).intersectObject(mesh).length,0);
  const resized=applyOperations(moved,{operations:[{op:'resize',id:'tool',dimensions:{x:40,y:20,z:120}}]});near(volume(resized),920000);
  const outside=applyOperations(resized,{operations:[{op:'translate',ids:['tool'],delta:[300,0,0]}]});near(volume(outside),1000000);
  assert.match(explain(subtract),/editable/);
  view.meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
});
test('Scavi su Imported STL restano modificabili dopo JSON, Annulla/Ripristina ed esportazione',()=>{
  const mesh=importSTL(exportSTL(project()).buffer,'body.stl','body'),source=project([mesh]);
  const drilled=decodeProject(encodeProject(drill(source)));assert.deepEqual(drilled.objects[0].vertices,mesh.vertices);
  const history=new History(drilled),moved=applyOperations(drilled,{operations:[{op:'translate',ids:['tool'],delta:[30,0,0]}]});history.commit(moved);
  const result=importSTL(exportSTL(moved).buffer,'cut.stl','result');near(volume(project([result])),960000);
  assert.deepEqual(history.undo(),drilled);assert.deepEqual(history.redo(),moved);
  const removed=applyOperations(moved,{operations:[{op:'delete',ids:['tool']}]});near(volume(removed),1000000);assert.deepEqual(removed.objects[0],mesh);
});
test('Bersagli espliciti preservano gruppi e ruote anche con molti pieni senza gruppo',()=>{
  const source={...project([{...body,groupId:'parts'},{...body,id:'panel',groupId:'parts'},...Array.from({length:40},(_,i)=>({...body,id:'other-'+i}))]),groups:[{id:'parts',name:'Carrozzeria'}]};
  const drilled=applyOperations(source,{operations:[create(tool),{...subtract,ids:['parts','body']}]});
  assert.deepEqual(drilled.objects.at(-1).targetIds,['body','panel']);assert.deepEqual(drilled.groups,source.groups);
  for(let i=0;i<source.objects.length;i++)assert.deepEqual(drilled.objects[i],source.objects[i]);
  near(volume(drilled),41920000);validateProject(drilled);
});
test('Fori multipli mantengono i propri bersagli; spegnere un foro ripristina solo il suo materiale',()=>{
  const first=drill(),second={...tool,id:'second',position:[30,0,50]};
  const drilled=applyOperations(first,{operations:[create(second),{...subtract,toolIds:['second']}]});near(volume(drilled),920000);
  const disabled=applyOperations(drilled,{operations:[{op:'update',id:'tool',changes:{hole:false,position:[300,0,50]}}]});near(volume(disabled),1008000);
  assert.deepEqual(disabled.objects.find(o=>o.id==='tool').targetIds,['body']);
  const restored=applyOperations(disabled,{operations:[{op:'update',id:'tool',changes:{hole:true,position:[0,0,50]}}]});near(volume(restored),920000);
});
test('Eliminare il bersaglio non fa scavare altri oggetti; i riferimenti vuoti restano espliciti',()=>{
  const drilled=drill(project([body,{...body,id:'other'}]));
  const removed=applyOperations(drilled,{operations:[{op:'delete',ids:['body']}]});
  assert.deepEqual(removed.objects.find(o=>o.id==='tool').targetIds,[]);near(volume(removed),1000000);
  assert.deepEqual(decodeProject(encodeProject(removed)),removed);
});
test('Riferimenti bersaglio non validi, ruoli errati e limiti non possono aggirare la validazione',()=>{
  const drilled=drill();
  for(const targetIds of [null,'body',['missing'],['tool'],['body','body'],['parts'],['body\n']])assert.throws(()=>validateProject({...drilled,objects:[body,{...tool,targetIds}]}));
  assert.throws(()=>applyOperations(project(),{operations:[create({...tool,targetIds:['body']})]}));
  assert.throws(()=>applyOperations(drilled,{operations:[{...subtract,bake:'yes'}]}));
  assert.throws(()=>applyOperations(drilled,{operations:[{op:'update',id:'tool',changes:{targetIds:['body']}}]}));
  assert.throws(()=>applyOperations(drilled,{operations:[{op:'update',id:'body',changes:{hole:true}}]}));
});
test('La finalizzazione esplicita conserva la sottrazione irreversibile precedente',()=>{
  const source=project();const result=applyOperations(source,{operations:[create(tool),{...subtract,bake:true}]});
  assert.equal(result.objects.length,1);assert.equal(result.objects[0].type,'mesh');near(volume(result),960000);
});
test('Il contratto AI usa scavi modificabili di default e restituisce utensili editabili',async t=>{
  let payload;const response={message:'Creo un foro modificabile.',operations:[create(tool),subtract]};
  t.mock.method(globalThis,'fetch',async(url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}));});
  const parsed=await interpretAI('Pratica un foro',project(),'body',{key:'test-key',url:'https://gateway.example',model:'test-model'});
  assert.match(payload.instructions,/bake:true.*explicitly/);
  const result=applyOperations(project(),{operations:parsed.operations});assert.equal(result.objects.find(o=>o.id==='tool').hole,true);
  assert.deepEqual(result.objects.find(o=>o.id==='tool').targetIds,['body']);
});

test('Un pieno interamente scavato resta recuperabile spostando il foro',()=>{
  const large={...tool,dimensions:{x:120,y:120,z:120}};
  const drilled=applyOperations(project(),{operations:[create(large),subtract]});
  assert.equal(drilled.objects.length,2);assert.deepEqual(drilled.objects[0],body);
  assert.throws(()=>exportSTL(drilled),/No solid material/);
  const moved=applyOperations(drilled,{operations:[{op:'translate',ids:['tool'],delta:[300,0,0]}]});near(volume(moved),1000000);
});
test('I limiti delle coppie esplicite e la finalizzazione parziale proteggono i bersagli',()=>{
  const source=project(Array.from({length:33},(_,i)=>({...body,id:'body-'+i})));
  assert.throws(()=>applyOperations(source,{operations:[create(tool),{...subtract,ids:source.objects.map(o=>o.id)}]}),/32 solid\/hole pairs/);
  const linked=applyOperations(project([body,{...body,id:'other'}]),{operations:[create(tool),{...subtract,ids:['body','other']}]});
  assert.throws(()=>applyOperations(linked,{operations:[{...subtract,bake:true}]}),/all targets/);
  const snapshot=structuredClone(linked);
  assert.throws(()=>applyOperations(linked,{operations:[{op:'translate',ids:['tool'],delta:[10,0,0]},{op:'delete',ids:['missing']}]}));
  assert.deepEqual(linked,snapshot);
});

test('I quattro passaruota restano modificabili nella scena affollata senza alterare ruote o gruppi',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=JSON.parse(await readFile(new URL('../public/examples/car.json',import.meta.url),'utf8'));
  source.objects.push(...[0,1].map(i=>({...body,id:'spare-'+i,position:[1000+i*200,0,50]})));
  const wheels=source.objects.filter(o=>o.groupId==='wheels');
  const tools=wheels.map((wheel,i)=>({...wheel,id:'arch-'+i,name:'Passaruota '+i,hole:true,groupId:null,dimensions:{radius:32,height:40}}));
  const drilled=applyOperations(source,{operations:[...tools.map(create),{op:'subtract',ids:['chassis'],toolIds:tools.map(o=>o.id)}]});
  assert.equal(drilled.objects.filter(o=>o.hole).length,4);assert.deepEqual(drilled.groups,source.groups);
  const saved=decodeProject(encodeProject(drilled));
  const moved=applyOperations(saved,{operations:[{op:'translate',ids:['arch-0'],delta:[500,0,0]}]});
  assert.ok(volume(moved)>volume(drilled)+1000);
  for(const wheel of wheels)assert.deepEqual(moved.objects.find(o=>o.id===wheel.id),wheel);
  assert.deepEqual(moved.objects.find(o=>o.id==='arch-0').targetIds,['chassis']);
  assert.deepEqual(moved.objects.find(o=>o.id==='chassis'),source.objects.find(o=>o.id==='chassis'));
});
