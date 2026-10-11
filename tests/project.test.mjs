import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProject, applyOperations } from '../public/js/project.js';
import { emptyProject, History } from '../public/js/state.js';
import { decodeProject, encodeProject } from '../public/js/files.js';
import { importSTL } from '../public/js/import.js';
import { exportSTL } from '../public/js/export.js';
const cube={id:'cube-1',type:'box',name:'Cubo',dimensions:{x:100,y:100,z:100},position:[0,0,50],rotation:[0,0,0],color:'#ef4444',groupId:null};
const batch=operations=>({operations});
const created=()=>applyOperations(emptyProject(),batch([{op:'create',object:cube}]));
test('Tutte le primitive, ID stabili e input immutato',()=>{
  const input=emptyProject(); const result=applyOperations(input,batch([{op:'create',object:cube}]));
  assert.equal(input.objects.length,0); assert.equal(result.objects[0].id,'cube-1');
  result.objects[0].dimensions.x=200; assert.equal(cube.dimensions.x,100);
  for(const [type,dimensions] of [['sphere',{radius:30}],['cylinder',{radius:20,height:60}],['cone',{radius:30,height:90}]]) assert.equal(applyOperations(emptyProject(),batch([{op:'create',object:{...cube,type,dimensions}}])).objects[0].type,type);
});
test('Traslazione, rotazione, dimensioni, colore e nome',()=>{
  const result=applyOperations(created(),batch([
    {op:'translate',ids:['cube-1'],delta:[50,0,0]},
    {op:'rotate',ids:['cube-1'],delta:[0,0,90]},
    {op:'resize',id:'cube-1',dimensions:{x:120,y:80,z:60}},
    {op:'update',id:'cube-1',changes:{name:'Nuovo',color:'#000000'}}
  ]));
  const o=result.objects[0]; assert.deepEqual(o.position,[50,0,50]); assert.deepEqual(o.rotation,[0,0,90]);
  assert.deepEqual(o.dimensions,{x:120,y:80,z:60}); assert.equal(o.name,'Nuovo'); assert.equal(o.color,'#000000');
});
test('Duplicazione, gruppi, destinatari sovrapposti, scioglimento ed eliminazione',()=>{
  const grouped=applyOperations(created(),batch([{op:'duplicate',id:'cube-1',newId:'cube-2',offset:[200,0,0]},{op:'group',id:'group-1',name:'Cubi',ids:['cube-1','cube-2']} ]));
  assert.equal(grouped.objects[1].position[0],200); assert.equal(grouped.objects[0].groupId,'group-1');
  const moved=applyOperations(grouped,batch([{op:'translate',ids:['group-1','cube-1'],delta:[0,20,0]}]));
  assert.equal(moved.objects[0].position[1],20); assert.equal(moved.objects[1].position[1],20);
  const ungrouped=applyOperations(grouped,batch([{op:'ungroup',id:'group-1'}]));
  assert.equal(ungrouped.groups.length,0); assert.equal(ungrouped.objects[0].groupId,null);
  const deleted=applyOperations(grouped,batch([{op:'delete',ids:['group-1']}]));
  assert.equal(deleted.groups.length,0); assert.equal(deleted.objects.length,0);
});
test('Batch atomico: errore successivo non modifica lo stato originale',()=>{
  const state=created();
  assert.throws(()=>applyOperations(state,batch([{op:'translate',ids:['cube-1'],delta:[10,0,0]},{op:'delete',ids:['missing']}])));
  assert.equal(state.objects[0].position[0],0);
});
test('Tipi, schema, riferimenti, limiti e prototype pollution vengono rifiutati',()=>{
  const state=created();
  for(const value of [0,-1,10001,'100',null,true,Infinity,NaN]) assert.throws(()=>applyOperations(state,batch([{op:'resize',id:'cube-1',dimensions:{x:value,y:1,z:1}}])));
  for(const op of [
    {op:'create',object:cube}, {op:'delete',ids:['missing']}, {op:'execute',code:'alert(1)'},
    {op:'update',id:'cube-1',changes:{type:'sphere'}}, {op:'update',id:'cube-1',changes:{}},
    {op:'translate',ids:['cube-1','cube-1'],delta:[1,2,3]}, {op:'translate',ids:['cube-1'],delta:[1,2]},
    {op:'update',id:'cube-1',changes:{color:'<script>'}}, {op:'duplicate',id:'cube-1',newId:'cube-1',offset:[1,2,3]},
    {op:'group',id:'cube-1',name:'Group',ids:['cube-1']}, {op:'ungroup',id:'missing'}
  ]) assert.throws(()=>applyOperations(state,batch([op])));
  for(const value of [null,[],{...state,units:'inch'},{...state,objects:{}},{...state,path:'../../etc/passwd'}, {...state,objects:[{...cube,groupId:'unknown'}]}]) assert.throws(()=>validateProject(value));
  assert.throws(()=>applyOperations(state,JSON.parse('{"operations":[],"__proto__":{"polluted":true}}')));
  assert.equal({}.polluted,undefined);
  assert.throws(()=>validateProject({...state,objects:[{...cube,id:'cube-1\n'}]}));
  assert.throws(()=>validateProject({...state,objects:[{...cube,color:'#ef4444\n'}]}));
  assert.throws(()=>applyOperations(state,batch(Array(101).fill({op:'delete',ids:['cube-1']}))));
  assert.throws(()=>validateProject({...state,objects:Array.from({length:201},(_,i)=>({...cube,id:'id-'+i}))}));
});
test('Tutti gli esempi si aprono e accettano operazioni validate senza backend',async()=>{
  for(const name of ['house','robot','car']) {
    const state=decodeProject(await readFile(new URL(`../public/examples/${name}.json`,import.meta.url),'utf8'));
    const changed=applyOperations(state,batch([{op:'create',object:{...cube,id:'test-sphere',type:'sphere',name:'Sfera blu',dimensions:{radius:40},color:'#5c9cf5'}}]));
    assert.equal(changed.objects.length,state.objects.length+1);
  }
});
test('JSON/STL round trip, modifica mesh e cronologia dopo importazione',()=>{
  const mesh=importSTL(exportSTL(created()).buffer,'cubo.stl','stl-1');
  const state={...emptyProject(),objects:[mesh]}; validateProject(state);
  const opened=decodeProject(encodeProject(state)); assert.deepEqual(opened,state);
  const modified=applyOperations(opened,batch([{op:'translate',ids:['stl-1'],delta:[50,0,0]},{op:'resize',id:'stl-1',dimensions:{x:200,y:100,z:100}}]));
  assert.equal(modified.objects[0].position[0],50); assert.equal(exportSTL(modified).getUint32(80,true),12);
  const history=new History(state); history.commit(modified);
  assert.equal(history.undo().objects[0].dimensions.x,100); assert.equal(history.redo().objects[0].dimensions.x,200);
  assert.throws(()=>applyOperations(state,batch([{op:'update',id:'stl-1',changes:{vertices:[]}}])));
  assert.throws(()=>validateProject({...state,objects:[{...mesh,vertices:[NaN,...mesh.vertices.slice(1)]}]}));
});
