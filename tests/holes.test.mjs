import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { applyOperations, validateProject } from '../public/js/project.js';
import { emptyProject, History } from '../public/js/state.js';
import { encodeProject, decodeProject } from '../public/js/files.js';
import { exportSTL } from '../public/js/export.js';
import { CadView } from '../public/js/renderer.js';
import { importSTL } from '../public/js/import.js';
const solid={id:'body',type:'box',name:'Blocco',dimensions:{x:100,y:100,z:100},position:[0,0,50],rotation:[0,0,0],color:'#ff0000',groupId:null};
const hole={...solid,id:'cut',name:'Foro',hole:true,dimensions:{x:20,y:20,z:120}};
const state=(objects=[solid,hole],groups=[])=>({...emptyProject(),objects,groups});
function volume(data) {
  let result=0;
  for(let i=0;i<data.getUint32(80,true);i++) {
    const at=84+i*50+12,v=[];
    for(let j=0;j<9;j++) v.push(data.getFloat32(at+j*4,true));
    const [ax,ay,az,bx,by,bz,cx,cy,cz]=v;
    result+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
  }
  return result;
}
const near=(actual,expected,tolerance=.1)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
test('Fori primitivi validati, ID stabili, dimensioni modificabili e conversione a pieno',()=>{
  const created=applyOperations(emptyProject(),{operations:[{op:'create',object:solid},{op:'create',object:hole}]});
  const changed=applyOperations(created,{operations:[{op:'update',id:'cut',changes:{hole:false}},{op:'resize',id:'cut',dimensions:{x:30,y:30,z:120}}]});
  assert.equal(created.objects[1].hole,true); assert.equal(changed.objects[1].id,'cut'); assert.equal(changed.objects[1].hole,false);
  for(const value of ['true',1,null]) assert.throws(()=>validateProject(state([solid,{...hole,hole:value}])));
  assert.throws(()=>validateProject(state([solid,...Array.from({length:9},(_,i)=>({...hole,id:'cut-'+i}))])));
  assert.throws(()=>validateProject(state([...Array.from({length:33},(_,i)=>({...solid,id:'body-'+i})),hole])));
});
test('Foro quadrato passante: volume sottratto nello STL, tunnel realmente aperto',()=>{
  const data=exportSTL(state()); near(volume(data),960000);
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};
  CadView.prototype.sync.call(view,state()); view.model.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,200),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(view.meshes.get('body')).length,0);
  assert.equal(view.meshes.get('cut').visible,false);
  view.meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
});
test('Forme foro invisibili anche quando selezionate; conversione a pieno ripristina la visibilità',()=>{
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,selection:new THREE.BoxHelper(new THREE.Object3D()),select:CadView.prototype.select};
  CadView.prototype.sync.call(view,state()); const cutter=view.meshes.get('cut');
  view.select('cut'); assert.equal(view.selectedId,'cut'); assert.equal(view.selection.visible,false);
  view.select('body'); assert.equal(view.selection.visible,true);
  const filled=applyOperations(state(),{operations:[{op:'update',id:'cut',changes:{hole:false}}]});
  CadView.prototype.sync.call(view,filled); assert.equal(view.meshes.get('cut'),cutter); assert.equal(cutter.visible,true);
  view.select('cut'); assert.equal(view.selection.visible,true);
  CadView.prototype.sync.call(view,state()); assert.equal(cutter.visible,false); assert.equal(view.selection.visible,false);
  near(volume(exportSTL(state())),960000);
  view.meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();}); view.selection.geometry.dispose(); view.selection.material.dispose();
});
test('Inquadratura ignora forme foro lontane e gestisce scene senza materiale visibile',()=>{
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){},camera:new THREE.PerspectiveCamera(40,1,.1,2000000),controls:{target:new THREE.Vector3(),update(){}}};
  CadView.prototype.sync.call(view,state([solid,{...hole,position:[30000,0,50]}]));
  CadView.prototype.frame.call(view); assert.deepEqual(view.controls.target.toArray(),[0,0,50]); assert.ok(view.camera.position.length()<1000);
  for(const objects of [[hole],[solid,{...hole,dimensions:{x:120,y:120,z:120}}]]) {
    CadView.prototype.sync.call(view,state(objects)); CadView.prototype.frame.call(view);
    assert.deepEqual(view.controls.target.toArray(),[0,0,50]); assert.deepEqual(view.camera.position.toArray(),[420,-550,400]);
  }
  view.meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
});
test('Foro cilindrico: volume del poligono a 48 lati, esportazione senza forma negativa',()=>{
  const cylinder={...hole,type:'cylinder',dimensions:{radius:10,height:120}};
  near(volume(exportSTL(state([solid,cylinder]))),1000000-48/2*100*Math.sin(2*Math.PI/48)*100,1);
  assert.throws(()=>exportSTL(state([cylinder])),/solid|material/i);
});
test('Cavità cieca, sfera e cono interni sottraggono il loro volume',()=>{
  const pocket={...hole,dimensions:{x:20,y:20,z:40},position:[0,0,90]};
  near(volume(exportSTL(state([solid,pocket]))),988000);
  for(const [type,dimensions] of [['sphere',{radius:10}],['cone',{radius:10,height:30}]]) {
    const cut={...hole,type,dimensions};
    const cutVolume=volume(exportSTL(state([{...cut,hole:false}])));
    near(volume(exportSTL(state([solid,cut]))),1000000-cutVolume,1);
  }
});
test('Trasformazioni relative: foro ruotato, spostato e più fori ricalcolati',()=>{
  const rotated={...hole,rotation:[0,90,0]};
  near(volume(exportSTL(state([solid,rotated]))),960000);
  const moved={...hole,position:[20,0,50]},other={...hole,id:'cut-2',position:[-20,0,50]};
  near(volume(exportSTL(state([solid,moved,other]))),920000);
  const objects=[solid,moved].map(o=>({...o,position:[o.position[0]+1000,o.position[1]-500,o.position[2]+80],rotation:[0,0,90]}));
  objects[1].position=[1000,-480,130];
  near(volume(exportSTL(state(objects))),960000,2);
});
test('Gruppi isolano lo scavo; fori esterni non modificano il volume; sottrazione completa è vuota',()=>{
  const grouped={...hole,groupId:'part'},target={...solid,groupId:'part'},other={...solid,id:'other',position:[200,0,50]};
  near(volume(exportSTL(state([target,grouped,other],[{id:'part',name:'Pezzo'}]))),1960000);
  near(volume(exportSTL(state([{...solid,groupId:'part'},hole],[{id:'part',name:'Pezzo'}]))),1000000);
  near(volume(exportSTL(state([solid,{...hole,position:[300,0,50]}]))),1000000);
  assert.throws(()=>exportSTL(state([solid,{...hole,dimensions:{x:120,y:120,z:120}}])),/solid|material/i);
});
test('Facce coplanari e forme foro a dimensioni piccole conservano il volume atteso',()=>{
  near(volume(exportSTL(state([solid,{...hole,dimensions:{x:20,y:20,z:100}}]))),960000);
  const small={...solid,dimensions:{x:1,y:1,z:1},position:[0,0,.5]};
  const cut={...hole,dimensions:{x:.2,y:.2,z:1.2},position:[0,0,.5]};
  near(volume(exportSTL(state([small,cut]))),.96,.000001);
});
test('Le mesh STL non diventano fori; un batch con hole non valido rimane atomico',()=>{
  const mesh={...solid,type:'mesh',dimensions:{x:10,y:10,z:0},vertices:[-5,-5,0,5,-5,0,-5,5,0]};
  const project=state([mesh]); validateProject(project);
  assert.throws(()=>applyOperations(project,{operations:[{op:'update',id:'body',changes:{hole:true}}]}));
  assert.throws(()=>applyOperations(state(),{operations:[{op:'translate',ids:['cut'],delta:[5,0,0]},{op:'update',id:'cut',changes:{hole:'true'}}]}));
  assert.deepEqual(hole.position,[0,0,50]);
});
test('Errore nel calcolo CSG non modifica la scena esistente né la sua geometria',()=>{
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};
  CadView.prototype.sync.call(view,state([solid])); const mesh=view.meshes.get('body'),geometry=mesh.geometry;
  const invalid={...hole,type:'unsupported'};
  assert.throws(()=>CadView.prototype.sync.call(view,state([solid,invalid])));
  assert.equal(view.meshes.get('body'),mesh); assert.equal(mesh.geometry,geometry); assert.equal(view.meshes.size,1);
  geometry.dispose(); mesh.material.dispose();
});
test('JSON e Undo/Redo conservano il foro modificabile; eliminare il foro ripristina il pieno',()=>{
  const project=decodeProject(encodeProject(state())),history=new History(project);
  assert.equal(project.objects[1].hole,true);
  const moved=applyOperations(project,{operations:[{op:'translate',ids:['cut'],delta:[200,0,0]}]}); history.commit(moved);
  near(volume(exportSTL(history.current)),1000000); near(volume(exportSTL(history.undo())),960000); near(volume(exportSTL(history.redo())),1000000);
  const removed=applyOperations(project,{operations:[{op:'delete',ids:['cut']}]}); near(volume(exportSTL(removed)),1000000);
});
test('JSON importato con mesh e forma foro scava la scena e lo STL; spostare il foro aggiorna la stessa mesh',()=>{
  const mesh=importSTL(exportSTL(state([solid])).buffer,'block.stl','body');
  const project=decodeProject(encodeProject(state([mesh,hole]))),history=new History(project);
  near(volume(exportSTL(project)),960000);
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};
  CadView.prototype.sync.call(view,project); const body=view.meshes.get('body'),geometry=body.geometry;
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,200),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(body).length,0); assert.equal(view.meshes.get('cut').visible,false);
  const moved=applyOperations(project,{operations:[{op:'translate',ids:['cut'],delta:[200,0,0]}]}); history.commit(moved);
  CadView.prototype.sync.call(view,moved); assert.equal(view.meshes.get('body'),body); assert.notEqual(body.geometry,geometry);
  near(volume(exportSTL(moved)),1000000); assert.ok(ray.intersectObject(body).length>0);
  near(volume(exportSTL(history.undo())),960000); near(volume(exportSTL(history.redo())),1000000);
  view.meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
});
test('Forme foro lavorano su STL importati, ridimensionati e ruotati; gli altri gruppi restano intatti',()=>{
  const mesh=importSTL(exportSTL(state([solid])).buffer,'block.stl','body');
  const target={...mesh,dimensions:{x:200,y:100,z:100},position:[1000,-500,50],rotation:[0,0,90],groupId:'part'};
  const cut={...hole,position:[1000,-500,50],groupId:'part'};
  near(volume(exportSTL(state([target,cut],[{id:'part',name:'Pezzo'}]))),1960000,1);
  near(volume(exportSTL(state([target,hole],[{id:'part',name:'Pezzo'}]))),2000000,1);
});
test('Il limite delle coppie pieno/foro include anche le mesh importate',()=>{
  const mesh=importSTL(exportSTL(state([solid])).buffer,'block.stl','body');
  const meshes=Array.from({length:33},(_,i)=>({...mesh,id:'body-'+i}));
  assert.throws(()=>validateProject(state([...meshes,hole])),/32/);
});
test('Cutsre una superficie STL piana è rifiutato senza alterare la scena; fori lontani la lasciano intatta',()=>{
  const plane={...solid,type:'mesh',dimensions:{x:10,y:10,z:0},vertices:[-5,-5,0,5,-5,0,-5,5,0]};
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};
  CadView.prototype.sync.call(view,state([plane])); const mesh=view.meshes.get('body'),geometry=mesh.geometry;
  assert.throws(()=>CadView.prototype.sync.call(view,state([plane,hole])),/volume|chius|superficie/i);
  assert.equal(mesh.geometry,geometry); assert.equal(view.meshes.size,1);
  assert.throws(()=>exportSTL(state([plane,hole])),/volume|chius|superficie/i);
  assert.equal(exportSTL(state([plane,{...hole,position:[500,0,50]}])).getUint32(80,true),1);
  geometry.dispose(); mesh.material.dispose();
});
test('Vani ruota reali nella carrozzeria: quattro cilindri foro e ruote conservate nel proprio gruppo',async()=>{
  const car=JSON.parse(await readFile(new URL('../public/examples/car.json',import.meta.url),'utf8'));
  const wheels=car.objects.filter(o=>o.groupId==='wheels');
  const cuts=wheels.map((o,i)=>({...o,id:'wheel-cut-'+i,name:'Vano ruota',dimensions:{radius:32,height:40},hole:true,groupId:null}));
  const updated=applyOperations(car,{operations:cuts.map(object=>({op:'create',object}))});
  assert.ok(volume(exportSTL(updated))<volume(exportSTL(car))-1000);
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};
  CadView.prototype.sync.call(view,car); const wheelGeometry=view.meshes.get(wheels[0].id).geometry;
  const bodyMesh=view.meshes.get('chassis'),bodyGeometry=bodyMesh.geometry;
  CadView.prototype.sync.call(view,updated);
  assert.equal(view.meshes.get(wheels[0].id).geometry,wheelGeometry);
  assert.equal(view.meshes.get('chassis'),bodyMesh); assert.notEqual(bodyMesh.geometry,bodyGeometry);
  view.model.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(70,200,40),new THREE.Vector3(0,-1,0));
  const hits=ray.intersectObject(bodyMesh);
  assert.ok(hits.length>0 && hits[0].point.y<45);
  view.meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
});
