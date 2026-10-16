import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeFits } from '../public/js/fit-analysis.js';
import { emptyProject } from '../public/js/state.js';

const box=(id,name,position,dimensions,fit)=>({
  id,type:'box',name,dimensions,position,rotation:[0,0,0],color:'#9bc9e8',groupId:null,...(fit?{fit}:{})
});
const body=box('body','Car body',[0,0,0],{x:100,y:100,z:100});
const project=glass=>({...emptyProject(),objects:[body,glass]});

test('Glass fit detects penetration, acceptable clearance and excessive distance',()=>{
  const fit={targetIds:['body'],maxGap:2};
  const penetrating=analyzeFits(project(box('glass','Windshield',[54,0,0],{x:10,y:40,z:40},fit)))[0];
  assert.equal(penetrating.status,'penetrating');
  assert.ok(penetrating.overlapVolume>0);

  const seated=analyzeFits(project(box('glass','Windshield',[56,0,0],{x:10,y:40,z:40},fit)))[0];
  assert.equal(seated.status,'within-tolerance');
  assert.ok(Math.abs(seated.clearance-1)<1e-6);

  const distant=analyzeFits(project(box('glass','Windshield',[60,0,0],{x:10,y:40,z:40},fit)))[0];
  assert.equal(distant.status,'too-far');
  assert.ok(Math.abs(distant.clearance-5)<1e-6);
});

test('Fit analysis checks only explicit glass-to-body targets',()=>{
  const glass=box('glass','Windshield',[56,0,0],{x:10,y:40,z:40},{targetIds:['body'],maxGap:2});
  const unrelated=box('wheel','Wheel',[56,0,0],{x:10,y:40,z:40});
  const report=analyzeFits({...emptyProject(),objects:[body,glass,unrelated]});
  assert.deepEqual(report.map(({objectId,targetId})=>[objectId,targetId]),[['glass','body']]);
});

test('The starter car declares three glass fits seated against the cabin',async()=>{
  const car=JSON.parse(await readFile(new URL('../public/examples/car.json',import.meta.url),'utf8'));
  const report=analyzeFits(car);
  assert.equal(report.length,3);
  assert.ok(report.every(result=>result.status==='within-tolerance'&&result.targetId==='cabin'));
});
