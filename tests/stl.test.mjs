import test from 'node:test';
import assert from 'node:assert/strict';
import { importSTL, MAX_STL_BYTES, MAX_STL_TRIANGLES } from '../public/js/import.js';
import { geometryFor } from '../public/js/renderer.js';
import { exportSTL } from '../public/js/export.js';
import { History, emptyProject } from '../public/js/state.js';
import { decodeProject, encodeProject } from '../public/js/files.js';
const box={id:'box',type:'box',name:'Box',dimensions:{x:100,y:80,z:60},position:[50,0,30],rotation:[0,0,0],color:'#ff0000',groupId:null};
const ascii=`solid triangle
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 10 0 0
vertex 0 10 0
endloop
endfacet
endsolid triangle`;
const text=s=>new TextEncoder().encode(s).buffer;
test('STL binario importato mantiene misure, posizione e triangoli nel round trip',()=>{
  const original=exportSTL({objects:[box]});
  const mesh=importSTL(original.buffer,'cubo.stl','stl-1');
  assert.equal(mesh.type,'mesh'); assert.equal(mesh.name,'cubo');
  assert.deepEqual(mesh.dimensions,box.dimensions); assert.deepEqual(mesh.position,box.position);
  assert.equal(mesh.vertices.length,12*9);
  const exported=exportSTL({objects:[mesh]});
  assert.equal(exported.getUint32(80,true),12);
  for(let i=0;i<12;i++) for(let j=0;j<9;j++) assert.equal(exported.getFloat32(84+i*50+12+j*4,true),original.getFloat32(84+i*50+12+j*4,true));
});
test('ASCII piano accettato e STL binario con header solid riconosciuto',()=>{
  const mesh=importSTL(text(ascii),'triangolo.stl','stl-1');
  assert.deepEqual(mesh.position,[5,5,0]); assert.deepEqual(mesh.dimensions,{x:10,y:10,z:0});
  assert.equal(exportSTL({objects:[mesh]}).getUint32(80,true),1);
  const binary=exportSTL({objects:[box]}).buffer;
  new Uint8Array(binary).set(new TextEncoder().encode('solid binary'));
  assert.equal(importSTL(binary,'cubo.stl','stl-2').vertices.length,12*9);
});
test('Mesh STL può essere ridimensionata e trasformata senza perdere vertici',()=>{
  const mesh=importSTL(exportSTL({objects:[box]}).buffer,'cubo.stl','stl-1');
  mesh.dimensions.x=200; const geometry=geometryFor(mesh); geometry.computeBoundingBox();
  assert.equal(geometry.boundingBox.max.x-geometry.boundingBox.min.x,200); geometry.dispose();
  const before=emptyProject(); const after={...before,objects:[mesh]}; const h=new History(before);
  h.commit(after); assert.equal(h.undo().objects.length,0); assert.equal(h.redo().objects[0].vertices.length,108);
});
test('STL malformati, non finiti, oltre i limiti e facce incomplete vengono rifiutati',()=>{
  for(const invalid of ['', 'garbage', ascii.replace('endfacet',''), ascii.replace('vertex 0 10 0',''), ascii.replace('vertex 0 0 0','vertex 0 0 0\nvertex 5 5 0')]) assert.throws(()=>importSTL(text(invalid),'x.stl','stl-1'));
  const binary=exportSTL({objects:[box]}).buffer;
  assert.throws(()=>importSTL(binary.slice(0,-1),'x.stl','stl-1'));
  new DataView(binary).setFloat32(96,Infinity,true);
  assert.throws(()=>importSTL(binary,'x.stl','stl-1'));
  assert.throws(()=>importSTL(new ArrayBuffer(MAX_STL_BYTES+1),'x.stl','stl-1'));
  const tooMany=new ArrayBuffer(84+(MAX_STL_TRIANGLES+1)*50); new DataView(tooMany).setUint32(80,MAX_STL_TRIANGLES+1,true);
  assert.throws(()=>importSTL(tooMany,'x.stl','stl-1'));
});
test('Casetta, robot e auto possono essere esportati, importati, salvati e riaperti',async()=>{
  const {readFile}=await import('node:fs/promises');
  for(const name of ['house','robot','car']) {
    const original=decodeProject(await readFile(new URL(`../public/examples/${name}.json`,import.meta.url),'utf8'));
    const stl=exportSTL(original); const mesh=importSTL(stl.buffer,name+'.stl','stl-1');
    const opened=decodeProject(encodeProject({...emptyProject(),objects:[mesh]}));
    assert.equal(exportSTL(opened).getUint32(80,true),stl.getUint32(80,true));
    assert.deepEqual(opened.objects[0].position,mesh.position);
    assert.deepEqual(opened.objects[0].dimensions,mesh.dimensions);
  }
});
