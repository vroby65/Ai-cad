import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyOperations} from '../public/js/project.js';
import {emptyProject,History} from '../public/js/state.js';
import {makeMesh,CadView} from '../public/js/renderer.js';
import {encodeProject,decodeProject} from '../public/js/files.js';
import {exportSTL} from '../public/js/export.js';
import {importSTL} from '../public/js/import.js';
import {evaluatedGeometry} from '../public/js/boolean.js';
const object={id:'rod',name:'Cilindro',type:'cylinder',dimensions:{radius:5,height:100},position:[0,0,50],rotation:[90,0,0],color:'#62c7a5',groupId:null};
const state={...emptyProject(),objects:[object]};
const rotate=(source,delta)=>applyOperations(source,{operations:[{op:'rotate',ids:['rod'],delta}]});
const quaternion=object=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation.map(THREE.MathUtils.degToRad),'XYZ'));
const near=(a,b)=>assert.ok(a.distanceTo(b)<1e-8,`${a.toArray()} != ${b.toArray()}`);

test('Un pezzo inclinato su X ruota realmente su Z della griglia anziché sommare il campo Euler',()=>{
  const rotated=rotate(state,[0,0,90]).objects[0];
  near(new THREE.Vector3(0,0,1).applyQuaternion(quaternion(rotated)),new THREE.Vector3(1,0,0));
  assert.deepEqual(rotated.position,object.position);assert.deepEqual(object.rotation,[90,0,0]);
  const mesh=makeMesh(rotated);near(new THREE.Vector3(0,0,1).applyQuaternion(mesh.quaternion),new THREE.Vector3(1,0,0));mesh.geometry.dispose();mesh.material.dispose();
});

test('Rotazioni composte su assi globali rispettano X poi Y poi Z e il comando inverso ripristina la posa',()=>{
  const original={...state,objects:[{...object,rotation:[30,-20,15]}]};
  const delta=[45,60,-30],rotated=rotate(original,delta),expected=quaternion(original.objects[0]);
  for(let i=0;i<3;i++)expected.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().setComponent(i,1),THREE.MathUtils.degToRad(delta[i])));
  assert.ok(1-Math.abs(quaternion(rotated.objects[0]).dot(expected))<1e-10);
  const successive=rotate(rotate(rotate(original,[45,0,0]),[0,60,0]),[0,0,-30]);
  assert.ok(1-Math.abs(quaternion(rotated.objects[0]).dot(quaternion(successive.objects[0])))<1e-10);
  const reversed=rotate(rotate(rotate(rotated,[0,0,30]),[0,-60,0]),[-45,0,0]);
  assert.ok(1-Math.abs(quaternion(original.objects[0]).dot(quaternion(reversed.objects[0])))<1e-10);
});

test('La rotazione conserva JSON, Annulla/Ripristina, identità della mesh e direzione esportata STL',()=>{
  const changed=rotate(state,[0,0,90]),saved=decodeProject(encodeProject(changed));assert.deepEqual(saved,changed);
  const history=new History(state);history.commit(changed);assert.deepEqual(history.undo(),state);assert.deepEqual(history.redo(),changed);
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};CadView.prototype.sync.call(view,state);const mesh=view.meshes.get('rod');
  CadView.prototype.sync.call(view,changed);assert.equal(view.meshes.get('rod'),mesh);mesh.geometry.dispose();mesh.material.dispose();
  const imported=importSTL(exportSTL(saved).buffer,'rotated.stl','imported');assert.ok(Math.abs(imported.dimensions.x-100)<.001);assert.ok(Math.abs(imported.dimensions.y-10)<.001);assert.ok(Math.abs(imported.dimensions.z-10)<.001);
});

test('Creazione, JSON preesistenti e orientamento assoluto del pannello mantengono Euler XYZ e limiti',()=>{
  assert.deepEqual(decodeProject(encodeProject(state)).objects[0].rotation,[90,0,0]);
  const changed=applyOperations(state,{operations:[{op:'update',id:'rod',changes:{rotation:[90,0,90]}}]});assert.deepEqual(changed.objects[0].rotation,[90,0,90]);
  near(new THREE.Vector3(0,0,1).applyQuaternion(quaternion(changed.objects[0])),new THREE.Vector3(0,-1,0));
  assert.deepEqual(rotate(state,[0,0,0]).objects[0].rotation,object.rotation);
  assert.throws(()=>rotate(state,[0,0,Infinity]));assert.throws(()=>rotate(state,[0,0,36001]));
});

test('La stessa rotazione globale su pieno e foro mantiene uno scavo realmente aperto',()=>{
  const body={...object,id:'part',type:'box',dimensions:{x:100,y:80,z:60},position:[0,0,0]};
  const hole={...body,id:'hole',name:'Foro',hole:true,targetIds:['part'],dimensions:{x:10,y:10,z:120}};
  const original={...emptyProject(),objects:[body,hole]};
  const changed=applyOperations(original,{operations:[{op:'rotate',ids:['part','hole'],delta:[0,0,90]}]});
  const geometry=evaluatedGeometry(changed.objects[0],changed),mesh=makeMesh(changed.objects[0],geometry);mesh.updateMatrixWorld(true);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(-100,0,0),new THREE.Vector3(1,0,0)).intersectObject(mesh).length,0);
  const bounds=new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());near(bounds,new THREE.Vector3(60,100,80));
  const imported=importSTL(exportSTL(changed).buffer,'rotated-hole.stl','result');assert.ok(Math.abs(imported.dimensions.x-60)<.001);assert.ok(Math.abs(imported.dimensions.y-100)<.001);
  mesh.geometry.dispose();mesh.material.dispose();assert.deepEqual(changed.objects[1].targetIds,['part']);
});
