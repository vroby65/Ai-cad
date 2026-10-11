import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CadView, geometryFor } from '../public/js/renderer.js';
import { exportSTL } from '../public/js/export.js';
const box={id:'box',type:'box',name:'Box',dimensions:{x:100,y:80,z:60},position:[50,0,30],rotation:[0,0,0],color:'#ff0000',groupId:null};
test('La scena mantiene la mesh per ID e sostituisce solo la geometria modificata',()=>{
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};
  CadView.prototype.sync.call(view,{objects:[box]});
  const mesh=view.meshes.get('box'); const geometry=mesh.geometry;
  CadView.prototype.sync.call(view,{objects:[{...box,position:[100,0,30],color:'#000000'}]});
  assert.equal(view.meshes.get('box'),mesh); assert.equal(mesh.geometry,geometry);
  assert.equal(mesh.position.x,100); assert.equal(mesh.material.color.getHexString(),'000000');
  CadView.prototype.sync.call(view,{objects:[{...box,dimensions:{x:200,y:80,z:60}}]});
  assert.equal(view.meshes.get('box'),mesh); assert.notEqual(mesh.geometry,geometry);
  CadView.prototype.sync.call(view,{objects:[]});
  assert.equal(view.meshes.size,0); assert.equal(view.model.children.length,0);
});
test('Box misura 100×80×60 mm e STL ha 12 triangoli',()=>{
  const data=exportSTL({objects:[box]});
  assert.equal(data.getUint32(80,true),12);
  assert.equal(data.byteLength,84+12*50);
  const vertices=[];
  for(let i=0;i<12;i++) for(let j=0;j<3;j++) {
    const at=84+i*50+12+j*12;
    vertices.push([0,1,2].map(k=>data.getFloat32(at+4*k,true)));
  }
  for(const [i,bounds] of [[0,[0,100]],[1,[-40,40]],[2,[0,60]]]) {
    const values=vertices.map(v=>v[i]);
    assert.deepEqual([Math.min(...values),Math.max(...values)],bounds);
  }
});
test('STL applica rotazione e traslazione, esclude griglia e assi',()=>{
  const rotated={...box,rotation:[0,0,90]};
  const data=exportSTL({objects:[rotated]});
  const xs=[],ys=[];
  for(let i=0;i<12;i++) for(let j=0;j<3;j++) { const at=84+i*50+12+j*12; xs.push(data.getFloat32(at,true));ys.push(data.getFloat32(at+4,true)); }
  assert.deepEqual([Math.min(...xs),Math.max(...xs)],[10,90]);
  assert.deepEqual([Math.min(...ys),Math.max(...ys)],[-50,50]);
  assert.throws(()=>exportSTL({objects:[]}));
});
test('Cilindro e cono verticali su Z; sfera con raggio corretto',()=>{
  for(const type of ['cylinder','cone','sphere']) {
    const g=geometryFor({...box,type,dimensions:type==='sphere'?{radius:30}:{radius:30,height:100}});
    g.computeBoundingBox(); const size=g.boundingBox.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x-60)<.001); assert.ok(Math.abs(size.y-60)<.001);
    assert.ok(Math.abs(size.z-(type==='sphere'?60:100))<.001);
    g.dispose();
  }
});
test('Ogni esempio produce STL binario finito',async()=>{
  const {readFile}=await import('node:fs/promises');
  for(const file of ['house','robot','car']) {
    const state=JSON.parse(await readFile(new URL(`../public/examples/${file}.json`,import.meta.url),'utf8'));
    const data=exportSTL(state); const count=data.getUint32(80,true);
    assert.ok(count>0); assert.equal(data.byteLength,84+count*50);
    for(let i=0;i<count;i++) for(let j=0;j<12;j++) assert.ok(Number.isFinite(data.getFloat32(84+i*50+j*4,true)));
  }
});
