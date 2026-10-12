import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyOperations } from '../public/js/project.js';
import { emptyProject, History } from '../public/js/state.js';
import { encodeProject, decodeProject } from '../public/js/files.js';
import { exportSTL } from '../public/js/export.js';
import { importSTL } from '../public/js/import.js';
import { CadView } from '../public/js/renderer.js';
import { interpretDeepSeek } from '../public/js/api.js';
import { explain } from '../public/js/explain.js';

const body={id:'body',type:'box',name:'Blocco',dimensions:{x:100,y:100,z:100},position:[0,0,50],rotation:[0,0,0],color:'#ff0000',groupId:null};
const tool={...body,id:'tool',name:'Scavo',hole:true,dimensions:{x:20,y:20,z:120}};
const state=(objects=[body,tool],groups=[])=>({...emptyProject(),objects,groups});
const cut={op:'subtract',ids:['body'],toolIds:['tool'],bake:true};
function volume(data) {
  let total=0;
  for(let i=0;i<data.getUint32(80,true);i++) {
    const p=84+i*50+12,v=Array.from({length:9},(_,j)=>data.getFloat32(p+j*4,true));
    const [ax,ay,az,bx,by,bz,cx,cy,cz]=v;
    total+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
  }
  return total;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1,`${a} != ${b}`);
test('Sottrazione modifica il solido con lo stesso ID e consuma la forma foro',()=>{
  const original=state(),updated=applyOperations(original,{operations:[cut]});
  assert.equal(updated.objects.length,1); const carved=updated.objects[0];
  assert.equal(carved.id,'body'); assert.equal(carved.type,'mesh'); assert.equal(carved.color,body.color); assert.equal(carved.name,body.name);
  assert.ok(carved.vertices.length>36); assert.equal('hole' in carved,false); near(volume(exportSTL(updated)),960000);
  assert.deepEqual(original,state());
  const view={meshes:new Map(),model:new THREE.Group(),selectedId:null,select(){}};
  CadView.prototype.sync.call(view,state([body])); const mesh=view.meshes.get('body');
  CadView.prototype.sync.call(view,updated); assert.equal(view.meshes.get('body'),mesh);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,200),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(mesh).length,0); assert.equal(mesh.visible,true);
  mesh.geometry.dispose(); mesh.material.dispose();
  assert.match(explain(cut),/Sottrae.*tool.*body/);
});
test('Sottrazione esplicita attraversa i gruppi solo sui bersagli indicati e preserva gli altri solidi',()=>{
  const original=state([{...body,groupId:'part'},tool,{...body,id:'wheel',groupId:'wheels'}],[{id:'part',name:'Carrozzeria'},{id:'wheels',name:'Ruote'}]);
  const updated=applyOperations(original,{operations:[{...cut,ids:['part','body']}]});
  assert.equal(updated.objects.find(o=>o.id==='body').groupId,'part'); assert.deepEqual(updated.objects.find(o=>o.id==='wheel'),original.objects[2]);
  near(volume(exportSTL(updated)),1960000);
});
test('Sottrazione su STL chiuso importato persiste nei vertici, nel JSON e dopo riapertura STL',()=>{
  const imported=importSTL(exportSTL(state([body])).buffer,'blocco.stl','body');
  const original=state([imported,tool]),history=new History(original);
  const updated=applyOperations(original,{operations:[cut]}); history.commit(updated);
  assert.notDeepEqual(updated.objects[0].vertices,imported.vertices);
  const reopened=decodeProject(encodeProject(updated)); near(volume(exportSTL(reopened)),960000);
  const downloaded=importSTL(exportSTL(reopened).buffer,'scavato.stl','result'); near(volume(exportSTL(state([downloaded]))),960000);
  assert.deepEqual(history.undo(),original); assert.deepEqual(history.redo(),updated);
});
test('Taglio laterale ricentra i vertici senza muovere il materiale, anche con solido ruotato',()=>{
  const rotated={...body,position:[1000,-500,80],rotation:[0,0,90]};
  const cutter={...tool,position:[1000,-460,80],rotation:[0,0,90],dimensions:{x:40,y:120,z:120}};
  const updated=applyOperations(state([rotated,cutter]),{operations:[cut]}); const carved=updated.objects[0];
  near(carved.dimensions.x,70); near(carved.dimensions.y,100); near(carved.position[0],1000); near(carved.position[1],-515); near(carved.position[2],80);
  near(volume(exportSTL(updated)),700000);
  const repeated=applyOperations(updated,{operations:[{op:'create',object:{...tool,position:[1000,-515,80]}},cut]});
  assert.ok(volume(exportSTL(repeated))<700000-1000);
});
test('Sottrazioni senza intersezione, utensili errati e batch malformati sono rifiutati senza mutazioni',()=>{
  const original=state();
  for(const op of [{...cut,toolIds:['missing']},{...cut,toolIds:['body']},{...cut,ids:[]},{...cut,toolIds:['tool','tool']},{...cut,extra:true}]) assert.throws(()=>applyOperations(original,{operations:[op]}));
  assert.throws(()=>applyOperations(state([body,{...tool,position:[500,0,50]}]),{operations:[cut]}),/interse|materiale/i);
  assert.throws(()=>applyOperations(state([body,{...tool,position:[60,0,50]}]),{operations:[cut]}),/interse|materiale/i);
  const carved=applyOperations(original,{operations:[cut]});
  assert.throws(()=>applyOperations(carved,{operations:[{op:'create',object:tool},cut]}),/materiale/i);
  assert.throws(()=>applyOperations(original,{operations:[cut,{op:'execute',code:'alert(1)'}]}));
  assert.deepEqual(original,state());
});
test('Un solido completamente scavato viene eliminato insieme alla forma foro',()=>{
  const original=state([{...body,groupId:'part'},{...tool,dimensions:{x:120,y:120,z:120}}],[{id:'part',name:'Pezzo'}]);
  const updated=applyOperations(original,{operations:[cut]}); assert.equal(updated.objects.length,0); assert.equal(updated.groups.length,0);
});
test('Quattro vani ruota modificano definitivamente la carrozzeria e conservano le ruote',async()=>{
  const {readFile}=await import('node:fs/promises');
  const car=JSON.parse(await readFile(new URL('../public/examples/car.json',import.meta.url),'utf8'));
  const wheels=car.objects.filter(o=>o.groupId==='wheels');
  const cutters=wheels.map((o,i)=>({...o,id:'cut-'+i,name:'Vano ruota',hole:true,groupId:null,dimensions:{radius:32,height:40}}));
  const updated=applyOperations(car,{operations:[...cutters.map(object=>({op:'create',object})),{op:'subtract',ids:['chassis'],toolIds:cutters.map(o=>o.id),bake:true}]});
  assert.equal(updated.objects.find(o=>o.id==='chassis').type,'mesh'); assert.equal(updated.objects.filter(o=>o.hole).length,0);
  for(const wheel of wheels) assert.deepEqual(updated.objects.find(o=>o.id===wheel.id),wheel);
  assert.ok(volume(exportSTL(updated))<volume(exportSTL(car))-1000);
  const saved=decodeProject(encodeProject(updated)); near(volume(exportSTL(saved)),volume(exportSTL(updated)));
});
test('Il contratto DeepSeek autorizza la sottrazione e applica il taglio allo STL scelto',async t=>{
  const imported=importSTL(exportSTL(state([body])).buffer,'blocco.stl','body'); let payload;
  const reply={message:'Sottraggo il foro dal solido, conservando il suo ID.',operations:[{op:'create',object:tool},cut]};
  t.mock.method(globalThis,'fetch',async(_url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]}));});
  const original=state([imported]); const batch=await interpretDeepSeek('Scava il solido selezionato',original,'body',{key:'test-key'});
  assert.ok(payload.messages[0].content.includes('toolIds')); assert.ok(payload.messages[0].content.includes('STL chiusi'));
  near(volume(exportSTL(applyOperations(original,{operations:batch.operations}))),960000);
});

async function crowdedCar() {
  const {readFile}=await import('node:fs/promises');
  const original=JSON.parse(await readFile(new URL('../public/examples/car.json',import.meta.url),'utf8'));
  original.objects.push(...Array.from({length:2},(_,i)=>({...body,id:'spare-'+i,position:[1000+i*200,0,50]})));
  const tools=original.objects.filter(o=>o.groupId==='wheels').map((o,i)=>({...o,id:'temporary-cut-'+i,name:'Vano ruota',hole:true,groupId:null,dimensions:{radius:32,height:40}}));
  return {original,tools,creates:tools.map(object=>({op:'create',object}))};
}
test('Quattro utensili temporanei in una scena affollata sono consumati da subtract senza contare pieni estranei',async t=>{
  const {original,tools,creates}=await crowdedCar(),snapshot=structuredClone(original);
  assert.equal(original.objects.filter(o=>o.groupId===null).length*tools.length,36);
  const response={message:'Scavo quattro passaruota solo nella carrozzeria.',operations:[...creates,{op:'subtract',ids:['chassis'],toolIds:tools.map(o=>o.id),bake:true}]};
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]})));
  const parsed=await interpretDeepSeek('Scava quattro passaruota',original,'chassis',{key:'test-key'});
  const updated=applyOperations(original,{operations:parsed.operations});
  assert.equal(updated.objects.find(o=>o.id==='chassis').type,'mesh');assert.equal(updated.objects.filter(o=>o.hole).length,0);
  for(const object of original.objects.filter(o=>o.id!=='chassis'))assert.deepEqual(updated.objects.find(o=>o.id===object.id),object);
  assert.ok(volume(exportSTL(updated))<volume(exportSTL(original))-1000);
  assert.deepEqual(decodeProject(encodeProject(updated)),updated);
  const history=new History(original);history.commit(updated);assert.deepEqual(history.undo(),original);assert.deepEqual(history.redo(),updated);
  assert.deepEqual(original,snapshot);
});
test('Fori creati prima di raggrupparli sono validati sui gruppi finali del batch',async()=>{
  const {original,tools,creates}=await crowdedCar();
  const updated=applyOperations(original,{operations:[...creates,{op:'group',id:'isolated-body',name:'Pezzo con utensili',ids:['chassis',...tools.map(o=>o.id)]}]});
  assert.equal(updated.objects.filter(o=>o.hole).length,4);
  assert.equal(updated.objects.find(o=>o.id==='chassis').groupId,'isolated-body');
  assert.ok(volume(exportSTL(updated))<volume(exportSTL(original))-1000);
});
test('I limiti finali per fori modificabili e quelli reali di subtract restano obbligatori e atomici',async()=>{
  const {original,creates}=await crowdedCar(),snapshot=structuredClone(original);
  assert.throws(()=>applyOperations(original,{operations:creates}),/Troppe sottrazioni.*32/);
  const solids=Array.from({length:9},(_,i)=>({...body,id:'body-'+i}));
  const tools=Array.from({length:4},(_,i)=>({...tool,id:'tool-'+i}));
  assert.throws(()=>applyOperations(state(solids),{operations:[...tools.map(object=>({op:'create',object})),{op:'subtract',ids:solids.map(o=>o.id),toolIds:tools.map(o=>o.id)}]}),/^Error: Operazione 5 \(subtract\): Sottrazione: massimo 8 forme foro e 32 coppie/);
  assert.throws(()=>applyOperations(original,{operations:[{op:'update',id:'chassis',changes:{dimensions:{x:-1,y:100,z:100}}},{op:'update',id:'chassis',changes:{dimensions:{x:100,y:100,z:100}}}]}),/Numero fuori limite/);
  assert.deepEqual(original,snapshot);
});
