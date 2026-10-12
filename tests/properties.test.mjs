import test from 'node:test';
import assert from 'node:assert/strict';
import { PropertyEditor } from '../public/js/properties.js';
import { applyOperations } from '../public/js/project.js';
import { emptyProject, History } from '../public/js/state.js';
import { geometryFor } from '../public/js/geometry.js';
import { evaluatedGeometry } from '../public/js/boolean.js';

class Element extends EventTarget {
  constructor(tag){super();this.tagName=tag;this.children=[];this.value='';this.disabled=false;this.attributes={};}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return (this.text||'')+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){throw Error('Unsafe HTML');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(name,value){this.attributes[name]=String(value);}
}
const document={createElement:tag=>new Element(tag)};
const box={id:'body',type:'box',name:'Corpo',color:'#ff0000',dimensions:{x:100,y:80,z:60},position:[0,0,30],rotation:[0,0,0],groupId:null};
function setup(object=box){
  const form=new Element('form'),fields=new Element('fieldset'),error=new Element('output');
  const history=new History({...emptyProject(),objects:[structuredClone(object)]});let calls=0;
  const editor=new PropertyEditor(form,fields,error,operation=>{
    const project=applyOperations(history.current,{operations:[operation]});
    const geometry=evaluatedGeometry(project.objects[0],project);geometry.dispose();
    history.commit(project);calls++;editor.render(project.objects[0]);
  },document);
  editor.render(object);
  return {editor,fields,error,history,submit:()=>form.dispatchEvent(new Event('submit',{cancelable:true})),calls:()=>calls};
}
test('L’editor applica nome, colore, coordinate, rotazione e misure sullo stesso ID con Annulla/Ripristina',()=>{
  const {editor,history,submit,calls}=setup();
  editor.inputs.name.value='Carrozzeria';editor.inputs.color.value='#00ff00';
  editor.inputs['position.x'].value='50.5';editor.inputs['rotation.z'].value='90';editor.inputs['dimensions.x'].value='120';
  submit();assert.equal(calls(),1);const changed=history.current.objects[0];
  assert.equal(changed.id,'body');assert.equal(changed.name,'Carrozzeria');assert.equal(changed.color,'#00ff00');
  assert.deepEqual(changed.position,[50.5,0,30]);assert.deepEqual(changed.rotation,[0,0,90]);assert.deepEqual(changed.dimensions,{x:120,y:80,z:60});
  assert.deepEqual(history.undo().objects[0],box);assert.deepEqual(history.redo().objects[0],changed);
  const geometry=geometryFor(changed);geometry.computeBoundingBox();assert.equal(geometry.boundingBox.max.x-geometry.boundingBox.min.x,120);geometry.dispose();
});
test('Primitive e mesh hanno solo le proprie misure; gli assi piani STL restano bloccati',()=>{
  for(const type of ['box','sphere','cylinder','cone','mesh']){
    const dimensions=type==='sphere'?{radius:20}:['cylinder','cone'].includes(type)?{radius:20,height:40}:{x:100,y:80,z:60};
    const object={...box,type,dimensions};if(type==='mesh')object.vertices=[-50,-40,0,50,-40,0,-50,40,0],object.dimensions={x:100,y:80,z:0};
    const {editor}=setup(object);
    assert.deepEqual(Object.keys(editor.inputs).filter(key=>key.startsWith('dimensions.')).map(key=>key.slice(11)),Object.keys(object.dimensions));
    if(type==='mesh'){assert.equal(editor.inputs['dimensions.z'].disabled,true);assert.equal(editor.inputs['dimensions.z'].value,'0');}
  }
});
test('Valori vuoti, non finiti o fuori limite non cambiano scena o cronologia',()=>{
  for(const [field,value] of [['dimensions.x',''],['dimensions.x','NaN'],['dimensions.x','-1'],['dimensions.x','10001'],['position.x','100001'],['rotation.x','36001'],['name',''],['color','#bad']]){
    const {editor,history,error,submit,calls}=setup();editor.inputs[field].value=value;submit();
    assert.equal(calls(),0);assert.deepEqual(history.current.objects[0],box);assert.equal(history.canUndo,false);assert.ok(error.textContent);
    assert.equal(editor.inputs[field].value,value);
  }
});
test('Selezione nuova, nessuna selezione e richiesta AI in corso impediscono aggiornamenti al pezzo sbagliato',()=>{
  const {editor,fields,submit,calls}=setup();editor.setBusy(true);editor.inputs.name.value='Non applicare';submit();assert.equal(calls(),0);assert.equal(fields.disabled,true);
  editor.render({...box,id:'other',name:'Altro'},true);assert.equal(editor.inputs.name.value,'Altro');submit();assert.equal(calls(),0);
  editor.setBusy(false);editor.render(null);submit();assert.equal(calls(),0);assert.equal(Object.keys(editor.inputs).length,0);
});
test('Inviare valori invariati non aggiunge snapshot; nomi HTML restano testo',()=>{
  const {editor,history,submit,error,calls}=setup({...box,name:'<script>alert(1)</script>'});
  assert.equal(editor.inputs.name.value,'<script>alert(1)</script>');submit();assert.equal(calls(),0);assert.equal(history.canUndo,false);assert.ok(error.textContent);
});

test('Ridimensionare una mesh STL importata cambia la geometria esportata e conserva l’ID',async()=>{
  const {exportSTL}=await import('../public/js/export.js');
  const {importSTL}=await import('../public/js/import.js');
  const source={...emptyProject(),objects:[box]};
  const object=importSTL(exportSTL(source).buffer,'Corpo.stl','imported');
  const {editor,history,submit}=setup(object);
  editor.inputs['dimensions.x'].value='120';editor.inputs['position.x'].value='50';submit();
  const changed=history.current.objects[0];assert.equal(changed.id,'imported');assert.equal(changed.type,'mesh');
  const roundTrip=importSTL(exportSTL(history.current).buffer,'modified.stl','round-trip');
  assert.deepEqual(roundTrip.dimensions,{x:120,y:80,z:60});assert.deepEqual(roundTrip.position,[50,0,30]);
  assert.deepEqual(history.undo().objects[0],object);
});
test('Modificare dimensioni e centro di un foro aggiorna lo scavo e si annulla',()=>{
  const hole={...box,id:'hole',name:'Foro',hole:true,dimensions:{x:10,y:10,z:120}};
  const history=new History({...emptyProject(),objects:[box,hole]});
  const form=new Element('form'),fields=new Element('fieldset'),error=new Element('output');
  const editor=new PropertyEditor(form,fields,error,operation=>{
    const updated=applyOperations(history.current,{operations:[operation]});
    const geometry=evaluatedGeometry(updated.objects[0],updated);geometry.dispose();
    history.commit(updated);editor.render(updated.objects[1]);
  },document);
  const volume=()=>{
    const state=history.current,base=evaluatedGeometry(state.objects[0],state),geometry=base.index ? base.toNonIndexed() : base,positions=geometry.getAttribute('position');let total=0;
    for(let i=0;i<positions.count;i+=3){
      const a=[positions.getX(i),positions.getY(i),positions.getZ(i)],b=[positions.getX(i+1),positions.getY(i+1),positions.getZ(i+1)],c=[positions.getX(i+2),positions.getY(i+2),positions.getZ(i+2)];
      total+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    }
    geometry.dispose();if(geometry!==base)base.dispose();return Math.abs(total);
  };
  editor.render(hole);assert.ok(Math.abs(volume()-474000)<.1);
  editor.inputs['dimensions.x'].value='20';form.dispatchEvent(new Event('submit',{cancelable:true}));assert.ok(Math.abs(volume()-468000)<.1);
  editor.inputs['position.x'].value='200';form.dispatchEvent(new Event('submit',{cancelable:true}));assert.ok(Math.abs(volume()-480000)<.1);
  history.undo();assert.ok(Math.abs(volume()-468000)<.1);assert.deepEqual(history.current.objects[0],box);
});
test('Una risposta breve usa il chiarimento precedente e lo stato modificato nel pannello',async t=>{
  const {ChatView}=await import('../public/js/chat.js');
  const {interpretDeepSeek}=await import('../public/js/api.js');
  const chat=new ChatView(new Element('div'),document);
  const turn=chat.start('Sposta il corpo dopo averlo allargato');
  chat.complete(turn,{message:'Di quanti millimetri lo sposto lungo X?',operations:[]},'Nessuna operazione');
  const {editor,history,submit}=setup();editor.inputs['dimensions.x'].value='120';editor.inputs['position.x'].value='50';submit();
  let payload;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    payload=JSON.parse(options.body);
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({message:'Sposto il corpo di 10 mm lungo X.',operations:[{op:'translate',ids:['body'],delta:[10,0,0]}]})}}]}));
  });
  const reply=await interpretDeepSeek('Di 10 mm',history.current,'body',{key:'test-key',messages:chat.messages()});
  assert.equal(JSON.parse(payload.messages[2].content).message,'Di quanti millimetri lo sposto lungo X?');
  const context=JSON.parse(payload.messages.at(-1).content);assert.equal(context.selectedId,'body');
  assert.equal(context.project.objects[0].dimensions.x,120);assert.equal(context.project.objects[0].position[0],50);
  const updated=applyOperations(history.current,{operations:reply.operations});assert.deepEqual(updated.objects[0].position,[60,0,30]);
});

test('Il pannello può spostare e ridimensionare il foro conservato da subtract',()=>{
  const hole={...box,id:'hole',name:'Foro',hole:true,dimensions:{x:10,y:10,z:120}};
  const source={...emptyProject(),objects:[box]};
  const drilled=applyOperations(source,{operations:[{op:'create',object:hole},{op:'subtract',ids:['body'],toolIds:['hole']}]});
  const history=new History(drilled),form=new Element('form'),fields=new Element('fieldset'),error=new Element('output');
  const editor=new PropertyEditor(form,fields,error,operation=>{
    const updated=applyOperations(history.current,{operations:[operation]});
    const geometry=evaluatedGeometry(updated.objects[0],updated);geometry.dispose();
    history.commit(updated);editor.render(updated.objects.find(o=>o.id==='hole'));
  },document);
  editor.render(drilled.objects.find(o=>o.id==='hole'));
  editor.inputs['position.x'].value='25';editor.inputs['dimensions.x'].value='20';form.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(error.textContent,'');const changed=history.current.objects.find(o=>o.id==='hole');
  assert.equal(changed.position[0],25);assert.equal(changed.dimensions.x,20);assert.deepEqual(changed.targetIds,['body']);
  assert.deepEqual(history.current.objects[0],box);assert.deepEqual(history.undo(),drilled);
});
