import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {geometryFor} from '../public/js/geometry.js';
import {applyOperations,validateProject} from '../public/js/project.js';
import {emptyProject,History} from '../public/js/state.js';
import {encodeProject,decodeProject} from '../public/js/files.js';
import {exportSTL} from '../public/js/export.js';
import {importSTL} from '../public/js/import.js';
import {CadView} from '../public/js/renderer.js';
import {interpretAI} from '../public/js/api.js';
import {explain} from '../public/js/explain.js';
import {readFile} from 'node:fs/promises';

const base={id:'shape',type:'box',name:'Forma',dimensions:{x:20,y:10,z:100},position:[0,0,50],rotation:[0,0,0],color:'#62c7a5',groupId:null};
const state=object=>({...emptyProject(),objects:[object]});
const create=object=>applyOperations(emptyProject(),{operations:[{op:'create',object}]});
const deform=(object,modifiers)=>applyOperations(state(object),{operations:[{op:'deform',id:object.id,modifiers}]});
const extrusion={...base,type:'extrude',dimensions:{x:40,y:30,z:20},position:[0,0,10],profile:[[0,0],[40,0],[40,10],[10,10],[10,30],[0,30]]};
const lathe={...base,type:'lathe',dimensions:{radius:40,height:100},profile:[[20,0],[40,50],[10,100]]};
function volume(project){const data=exportSTL(project);let v=0;for(let i=0;i<data.getUint32(80,true);i++){const [a,b,c,d,e,f,g,h,k]=Array.from({length:9},(_,j)=>data.getFloat32(96+i*50+j*4,true));v+=(a*(e*k-f*h)+b*(f*g-d*k)+c*(d*h-e*g))/6;}return v;}
const near=(a,b,tolerance=.01)=>assert.ok(Math.abs(a-b)<=Math.abs(b)*tolerance+.001,`${a} != ${b}`);
function finite(geometry){for(const name of ['position','normal'])for(const value of geometry.getAttribute(name).array)assert.ok(Number.isFinite(value));assert.ok((geometry.index?.count||geometry.getAttribute('position').count)/3<=20000);}

test('Toro chiuso: misure, volume e buco centrale reale',()=>{
  const torus={...base,type:'torus',dimensions:{radius:40,tube:10}};create(torus);
  const g=geometryFor(torus);g.computeBoundingBox();const size=g.boundingBox.getSize(new THREE.Vector3());near(size.x,100,.0001);near(size.y,100,.0001);near(size.z,20,.0001);finite(g);
  near(volume(state(torus)),2*Math.PI*Math.PI*40*100,.02);
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());assert.equal(new THREE.Raycaster(new THREE.Vector3(0,0,100),new THREE.Vector3(0,0,-1)).intersectObject(mesh).length,0);g.dispose();mesh.material.dispose();
});
test('Estrusione concava: profilo chiuso centrato e volume verificato',()=>{
  const project=create(extrusion),g=geometryFor(extrusion);g.computeBoundingBox();near(g.boundingBox.min.x,-20,.0001);near(g.boundingBox.max.y,15,.0001);finite(g);near(volume(project),12000,.0001);g.dispose();
  const saved=decodeProject(encodeProject(project));assert.deepEqual(saved,project);
  const changed=applyOperations(saved,{operations:[{op:'resize',id:'shape',dimensions:{x:80,y:30,z:20}}]});near(volume(changed),24000,.0001);
});
test('Solido di rivoluzione: profilo radiale con fondi chiusi e volume di tronchi di cono',()=>{
  const project=create(lathe);const expected=50*Math.PI*(400+800+1600)/3+50*Math.PI*(1600+400+100)/3;
  near(volume(project),expected,.003);const g=geometryFor(lathe);g.computeBoundingBox();near(g.boundingBox.max.z-g.boundingBox.min.z,100,.0001);finite(g);g.dispose();
});
test('Profili auto-intersecanti, piatti, fuori limite e rivoluzioni non valide sono rifiutati',()=>{
  for(const profile of [[],[[0,0],[1,1]],[[0,0],[10,10],[0,10],[10,0]],[[0,0],[0,10],[0,20]],[[0,0],[10,0],[10,0],[0,10]],[[0,0],[10001,0],[0,10]],[[0,0],['10',0],[0,10]]])assert.throws(()=>create({...extrusion,profile}));
  for(const profile of [[[1,0]],[[10,10],[20,0]],[[0,0],[0,10]],[[10,0],[-1,10]],[[10,0],[0,20],[10,40]]])assert.throws(()=>create({...lathe,profile}));
  assert.throws(()=>create({...extrusion,profile:Array.from({length:65},(_,i)=>[Math.cos(i),Math.sin(i)])}));
  assert.throws(()=>create({...extrusion,code:'alert(1)'}));
  assert.throws(()=>create({...base,type:'torus',dimensions:{radius:10,tube:10}}));
});
test('Twist produce vere superfici intermedie, conserva volume e si annulla',()=>{
  const original=state(base),twisted=deform(base,[{type:'twist',axis:'z',angle:90}]);assert.equal(twisted.objects[0].type,'box');assert.deepEqual(base.dimensions,{x:20,y:10,z:100});
  const g=geometryFor(twisted.objects[0]);finite(g);assert.ok(g.getAttribute('position').count>36);near(volume(twisted),20000,.006);g.dispose();
  const history=new History(original);history.commit(twisted);assert.deepEqual(history.undo(),original);assert.deepEqual(history.redo(),twisted);
  const reset=applyOperations(twisted,{operations:[{op:'deform',id:'shape',modifiers:[]}]});near(volume(reset),20000,.0001);
});
test('Bend di 180 gradi forma un arco con volume conservato e normali finite',()=>{
  const rod={...base,dimensions:{x:10,y:10,z:100}},bent=deform(rod,[{type:'bend',axis:'z',angle:180}]);const g=geometryFor(bent.objects[0]);g.computeBoundingBox();near(g.boundingBox.max.x,100/Math.PI,.005);near(volume(bent),10000,.006);finite(g);g.dispose();
  const xRod={...rod,dimensions:{x:100,y:10,z:10}},xBent=deform(xRod,[{type:'bend',axis:'x',angle:180}]);const xg=geometryFor(xBent.objects[0]);xg.computeBoundingBox();near(xg.boundingBox.max.y,100/Math.PI,.005);xg.dispose();
});
test('Taper ha il volume di un tronco di piramide e mantiene i parametri originali',()=>{
  const box={...base,dimensions:{x:100,y:80,z:120}},result=deform(box,[{type:'taper',axis:'z',factor:.5}]);near(volume(result),960000*(1+.5+.25)/3,.002);assert.deepEqual(result.objects[0].dimensions,box.dimensions);
});
test('Deformazioni concatenate persistono nel JSON e producono STL reimportabile',()=>{
  const object={...base,dimensions:{x:20,y:20,z:100}},modifiers=[{type:'twist',axis:'z',angle:90},{type:'taper',axis:'z',factor:.7},{type:'bend',axis:'z',angle:45}];
  const result=deform(object,modifiers),saved=decodeProject(encodeProject(result));assert.deepEqual(saved,result);near(volume(saved),40000*(1+.7+.49)/3,.015);
  const mesh=importSTL(exportSTL(saved).buffer,'deformed.stl','imported');near(volume(state(mesh)),volume(saved),.0001);
});
test('Una mesh STL sparsa viene suddivisa prima di deformarla e conserva i vertici sorgente',()=>{
  const mesh=importSTL(exportSTL(state({...base,dimensions:{x:10,y:10,z:100}})).buffer,'rod.stl','shape'),copy=structuredClone(mesh);
  const result=deform(mesh,[{type:'bend',axis:'z',angle:90}]);assert.deepEqual(result.objects[0].vertices,copy.vertices);assert.ok(exportSTL(result).getUint32(80,true)>12);near(volume(result),10000,.006);
});
test('Piegature ripiegate, modificatori fuori schema e batch invalidi restano atomici',()=>{
  for(const modifiers of [[{type:'bend',axis:'z',angle:181}],[{type:'twist',axis:'q',angle:90}],[{type:'taper',axis:'z',factor:0}],[{type:'twist',axis:'z',angle:'90'}],[{type:'twist',axis:'z',angle:90,code:'alert(1)'}],Array(7).fill({type:'twist',axis:'z',angle:90})])assert.throws(()=>deform(base,modifiers));
  const wide={...base,dimensions:{x:100,y:100,z:100}};assert.throws(()=>deform(wide,[{type:'bend',axis:'z',angle:180}]),/bend|radius|fold/i);
  const source=state(base),copy=structuredClone(source);assert.throws(()=>applyOperations(source,{operations:[{op:'deform',id:'shape',modifiers:[{type:'twist',axis:'z',angle:90}]},{op:'delete',ids:['missing']}]}));assert.deepEqual(source,copy);
});
test('Aggiornare un profilo o una deformazione invalida la geometria ma conserva la mesh per ID',()=>{
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};CadView.prototype.sync.call(view,state(extrusion));const mesh=view.meshes.get('shape'),old=mesh.geometry;
  const changed=applyOperations(state(extrusion),{operations:[{op:'update',id:'shape',changes:{profile:[[0,0],[40,0],[40,30],[0,30]]}}]});CadView.prototype.sync.call(view,changed);assert.equal(view.meshes.get('shape'),mesh);assert.notEqual(mesh.geometry,old);near(volume(changed),24000,.0001);
  const deformed=applyOperations(changed,{operations:[{op:'deform',id:'shape',modifiers:[{type:'twist',axis:'z',angle:20}]}]});const plain=mesh.geometry;CadView.prototype.sync.call(view,deformed);assert.notEqual(mesh.geometry,plain);mesh.geometry.dispose();mesh.material.dispose();
});
test('Fori modificabili lavorano sui profili complessi e la finalizzazione non riapplica i parametri',()=>{
  const hole={...base,id:'hole',type:'cylinder',name:'Foro',hole:true,dimensions:{radius:3,height:30},position:[-15,-10,10]};
  const drilled=applyOperations(state(extrusion),{operations:[{op:'create',object:hole},{op:'subtract',ids:['shape'],toolIds:['hole']}]});assert.deepEqual(drilled.objects[0],extrusion);assert.ok(volume(drilled)<11500);
  const baked=applyOperations(drilled,{operations:[{op:'subtract',ids:['shape'],toolIds:['hole'],bake:true}]});assert.equal(baked.objects[0].type,'mesh');assert.equal('profile' in baked.objects[0],false);assert.equal('modifiers' in baked.objects[0],false);near(volume(baked),volume(drilled),.0001);validateProject(baked);
});
test('L’AI può creare profili e deformarli con JSON controllato, senza fornire codice o vertici',async t=>{
  let payload;const reply={message:'Creo un vaso sagomato e lo rastremo.',operations:[{op:'create',object:lathe},{op:'deform',id:'shape',modifiers:[{type:'taper',axis:'z',factor:.8}]}]};
  t.mock.method(globalThis,'fetch',async(url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]}));});
  const parsed=await interpretAI('Crea un vaso sofisticato rastremato',emptyProject(),null,{key:'test-key',url:'https://gateway.example',model:'test-model'});assert.match(payload.instructions,/extrude/);assert.match(payload.instructions,/lathe/);assert.match(payload.instructions,/deform/);assert.equal(applyOperations(emptyProject(),{operations:parsed.operations}).objects[0].modifiers[0].factor,.8);
});

test('Deformare solidi e utensili conserva scavi modificabili e finalizza senza doppie deformazioni',()=>{
  const object={...base,modifiers:[{type:'taper',axis:'z',factor:.7}]};
  const tool={...base,id:'hole',name:'Foro deformato',dimensions:{x:4,y:4,z:120},hole:true,modifiers:[{type:'twist',axis:'z',angle:45}]};
  const drilled=applyOperations(state(object),{operations:[{op:'create',object:tool},{op:'subtract',ids:['shape'],toolIds:['hole']}]});
  const originalVolume=volume(state(object)),cutVolume=volume(drilled);assert.ok(cutVolume<originalVolume-1000);
  const shifted=applyOperations(drilled,{operations:[{op:'translate',ids:['hole'],delta:[100,0,0]}]});near(volume(shifted),originalVolume,.0001);
  const baked=applyOperations(drilled,{operations:[{op:'subtract',ids:['shape'],toolIds:['hole'],bake:true}]});
  assert.equal('modifiers' in baked.objects[0],false);near(volume(baked),cutVolume,.0001);assert.deepEqual(decodeProject(encodeProject(drilled)),drilled);
});

test('Budget triangoli ed estensioni deformate proteggono anche STL e batch atomici',()=>{
  const large={...base,dimensions:{x:5000,y:5000,z:100}};
  assert.throws(()=>deform(large,[{type:'taper',axis:'z',factor:4}]),/10000/);
  const flat={...base,type:'mesh',vertices:[-5,-5,0,5,-5,0,-5,5,0],dimensions:{x:10,y:10,z:0}};
  assert.throws(()=>deform(flat,[{type:'bend',axis:'z',angle:45}]),/zero/);
  const source=importSTL(exportSTL(state({...base,type:'sphere',dimensions:{radius:10}})).buffer,'sphere.stl','shape');
  assert.throws(()=>deform(source,Array(6).fill({type:'twist',axis:'z',angle:90})),/20000/);
  assert.equal('modifiers' in source,false);
});

test('Spiegazioni dei nuovi parametri sono leggibili e non mostrano oggetti JavaScript',()=>{
  const text=explain({op:'update',id:'shape',changes:{profile:extrusion.profile,modifiers:[{type:'bend',axis:'z',angle:45}]}});
  assert.match(text,/6 reference points/);assert.match(text,/bend.*Z.*45°/);assert.doesNotMatch(text,/object Object/);
  const created=explain({op:'create',object:{...extrusion,modifiers:[{type:'twist',axis:'z',angle:90}]}});
  assert.match(created,/6 points/);assert.match(created,/twist.*Z.*90°/);
});

test('Il progetto Forme complesse si apre e produce un STL con profili, deformazioni e scavo reale',async()=>{
  const project=decodeProject(await readFile(new URL('../public/examples/advanced.json',import.meta.url),'utf8'));
  for(const type of ['torus','extrude','lathe'])assert.ok(project.objects.some(o=>o.type===type));
  for(const type of ['twist','bend','taper'])assert.ok(project.objects.some(o=>o.modifiers?.some(m=>m.type===type)));
  const output=exportSTL(project);assert.ok(output.getUint32(80,true)>1000);
  const vase=project.objects.find(o=>o.id==='vase'),tool=project.objects.find(o=>o.id==='vase-hole');assert.deepEqual(tool.targetIds,['vase']);
  assert.ok(volume({...project,objects:[vase,tool]})<volume(state(vase))-10000);
  const imported=importSTL(output.buffer,'advanced.stl','imported');near(volume(state(imported)),volume(project),.0001);
});
