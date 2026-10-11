import test from 'node:test';
import assert from 'node:assert/strict';
import { setupChatResize } from '../public/js/layout.js';

class Element extends EventTarget {
  constructor(height=0) { super(); this.clientHeight=height; this.offsetHeight=height; this.height=height; this.attributes={}; this.style={setProperty:(name,value)=>{this.height=parseFloat(value);this.property=name;}}; }
  getBoundingClientRect() { return {height:this.height}; }
  setAttribute(name,value) { this.attributes[name]=String(value); }
  setPointerCapture(id) { this.capture=id; }
  hasPointerCapture(id) { return this.capture===id; }
  releasePointerCapture() { this.capture=null; }
}
function setup(t) {
  const previous=globalThis.ResizeObserver; let resize;
  globalThis.ResizeObserver=class {constructor(callback){resize=callback;} observe(){}};
  t.after(()=>{if(previous===undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver=previous;});
  const editor=new Element(600),chat=new Element(240),handle=new Element(8);
  setupChatResize(editor,chat,handle);
  const send=(type,properties)=>{const event=new Event(type,{cancelable:true});Object.assign(event,properties);handle.dispatchEvent(event);return event;};
  return {editor,chat,handle,send,resize:()=>resize()};
}
test('Trascinare il separatore regola la chat; gli altri puntatori e il rilascio non alterano la misura',t=>{
  const {chat,handle,send}=setup(t);
  send('pointerdown',{button:0,pointerId:1,clientY:400}); assert.equal(handle.capture,1);
  send('pointermove',{pointerId:2,clientY:300}); assert.equal(chat.height,240);
  send('pointermove',{pointerId:1,clientY:340}); assert.equal(chat.height,300);
  assert.equal(handle.attributes['aria-valuenow'],'300');
  send('pointerup',{pointerId:1}); assert.equal(handle.capture,null);
  send('pointermove',{pointerId:1,clientY:100}); assert.equal(chat.height,300);
});
test('Frecce, Home ed End rispettano i limiti e il ridimensionamento della finestra',t=>{
  const {editor,chat,handle,send,resize}=setup(t);
  assert.equal(send('keydown',{key:'ArrowUp'}).defaultPrevented,true); assert.equal(chat.height,260);
  send('keydown',{key:'ArrowDown'}); assert.equal(chat.height,240);
  send('keydown',{key:'Home'}); assert.equal(chat.height,140);
  send('keydown',{key:'End'}); assert.equal(chat.height,432);
  assert.equal(handle.attributes['aria-valuemax'],'432');
  editor.clientHeight=300; resize(); assert.equal(chat.height,140);
  assert.equal(send('keydown',{key:'Tab'}).defaultPrevented,false);
});
test('Il trascinamento touch è limitato; annullamento e tasto destro non continuano a ridimensionare',t=>{
  const {chat,send}=setup(t);
  send('pointerdown',{button:0,pointerId:7,clientY:400,pointerType:'touch'});
  send('pointermove',{pointerId:7,clientY:-1000}); assert.equal(chat.height,432);
  send('pointermove',{pointerId:7,clientY:2000}); assert.equal(chat.height,140);
  send('pointercancel',{pointerId:7}); send('pointermove',{pointerId:7,clientY:300}); assert.equal(chat.height,140);
  send('pointerdown',{button:2,pointerId:8,clientY:400}); send('pointermove',{pointerId:8,clientY:100}); assert.equal(chat.height,140);
});
