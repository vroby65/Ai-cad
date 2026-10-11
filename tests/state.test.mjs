import test from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../public/js/state.js';
import { decodeProject, encodeProject, MAX_FILE_BYTES } from '../public/js/files.js';
const state = {version:1,name:'Progetto',units:'mm',objects:[],groups:[]};
test('Annulla, ripristina, indipendenza degli snapshot e nuovo ramo', () => {
  const h = new History(state);
  const s = {...state,name:'Secondo'};
  h.commit(s); s.name='Mutato';
  assert.equal(h.current.name,'Secondo');
  assert.equal(h.undo().name,'Progetto');
  assert.equal(h.redo().name,'Secondo');
  h.undo(); h.commit({...state,name:'Terzo'});
  assert.equal(h.canRedo,false);
  assert.equal(h.current.name,'Terzo');
});
test('Storia limitata e reset dopo apertura', () => {
  const h=new History(state,3);
  for(let i=0;i<10;i++) h.commit({...state,name:String(i)});
  h.undo(); h.undo(); assert.equal(h.canUndo,false);
  h.reset(state); assert.equal(h.canRedo,false); assert.equal(h.canUndo,false);
});
test('JSON round trip e controllo dimensione prima del caricamento', () => {
  assert.deepEqual(decodeProject(encodeProject(state)),state);
  assert.throws(()=>decodeProject('x'.repeat(MAX_FILE_BYTES+1)));
  assert.throws(()=>decodeProject('{broken'));
});
