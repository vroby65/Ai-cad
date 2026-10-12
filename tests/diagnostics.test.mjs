import test from 'node:test';
import assert from 'node:assert/strict';
import {Diagnostics} from '../public/js/diagnostics.js';
import {applyOperations} from '../public/js/project.js';
import {emptyProject} from '../public/js/state.js';
import {CadView} from '../public/js/renderer.js';

test('I log conservano fasi ed errori ma eliminano chiavi, header, vertici e ragionamento',()=>{
  const log=new Diagnostics(()=> 'fake-secret-key');
  log.record('request',{command:'Crea un cubo fake-secret-key',Authorization:'Bearer another-secret',apiKey:'another-key',project:{objects:[{id:'mesh',vertices:[1,2,3]}]}});
  log.record('response',{content:'sk-0123456789abcdef0123456789abcdef',reasoning_content:'private-thought'});
  const raw=log.export();assert.match(raw,/request/);assert.match(raw,/mesh/);
  assert.doesNotMatch(raw,/fake-secret-key|another-secret|another-key|0123456789abcdef|private-thought|"vertices"/);
  assert.ok(JSON.parse(raw).entries.every(e=>e.time&&e.stage));
});

test('I log sono limitati, isolati dai dati originali e cancellabili',()=>{
  const log=new Diagnostics(),data={message:'original'};log.record('test',data);data.message='changed';assert.match(log.export(),/original/);
  for(let i=0;i<250;i++)log.record('response',{i,content:'x'.repeat(100000)});
  assert.ok(new TextEncoder().encode(log.export()).byteLength<1024*1024);
  assert.ok(JSON.parse(log.export()).entries.length<=100);assert.match(log.export(),/249/);
  log.clear();assert.deepEqual(JSON.parse(log.export()).entries,[]);
});

test('Errori delle operazioni e della geometria identificano esattamente il pezzo rifiutato',()=>{
  const box={id:'body',name:'Corpo',type:'box',dimensions:{x:100,y:100,z:100},position:[0,0,50],rotation:[0,0,0],color:'#ff0000',groupId:null};
  assert.throws(()=>applyOperations(emptyProject(),{operations:[{op:'create',object:box},{op:'update',id:'body',changes:{dimensions:{x:20,y:30}}}]}),/Operazione 2.*body.*z/);
  const project={...emptyProject(),objects:[{...box,modifiers:[{type:'bend',axis:'z',angle:180}]}]};
  assert.throws(()=>CadView.prototype.prepare.call({meshes:new Map()},project),/Geometria.*body.*Piegatura/);
});
