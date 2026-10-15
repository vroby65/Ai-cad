import test from 'node:test';
import assert from 'node:assert/strict';
import { exportOBJ } from '../public/js/export.js';

const box={id:'box',type:'box',name:'Box',dimensions:{x:100,y:80,z:60},position:[50,0,30],rotation:[0,0,90],color:'#ff0000',groupId:null};

function records(obj,prefix) {
  return obj.split('\n').filter(line=>line.startsWith(prefix)).map(line=>line.slice(prefix.length));
}

test('OBJ esporta triangoli separati per oggetto con trasformazioni mondiali in millimetri',()=>{
  const second={...box,id:'box-2',position:[250,0,30]};
  const obj=exportOBJ({objects:[box,second]});
  assert.match(obj,/^# AIcad OBJ export\n# Units: millimeters\n/);
  assert.deepEqual(records(obj,'o '),['box','box-2']);
  const vertices=records(obj,'v ').map(line=>line.split(' ').map(Number));
  const faces=records(obj,'f ').map(line=>line.split(' ').map(Number));
  assert.equal(faces.length,24);
  for(const face of faces) {
    assert.equal(face.length,3);
    assert.ok(face.every(index=>Number.isInteger(index)&&index>=1&&index<=vertices.length));
  }
  const bounds=axis=>[Math.min(...vertices.map(v=>v[axis])),Math.max(...vertices.map(v=>v[axis]))];
  assert.deepEqual(bounds(0),[10,290]);
  assert.deepEqual(bounds(1),[-50,50]);
  assert.deepEqual(bounds(2),[0,60]);
});

test('OBJ usa la geometria valutata dei tagli ed esclude gli utensili foro',()=>{
  const solid={...box,position:[0,0,50],rotation:[0,0,0],dimensions:{x:100,y:100,z:100}};
  const hole={...solid,id:'cut',name:'Cut',hole:true,targetIds:['box'],dimensions:{x:20,y:20,z:120}};
  const obj=exportOBJ({objects:[solid,hole]});
  assert.deepEqual(records(obj,'o '),['box']);
  assert.ok(records(obj,'f ').length>12);
  assert.doesNotMatch(obj,/^o cut$/m);
  assert.throws(()=>exportOBJ({objects:[hole]}),/solid material/i);
  assert.throws(()=>exportOBJ({objects:[]}),/object/i);
});
