import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatView } from '../public/js/chat.js';
class Element {
  constructor(tag) { this.tagName=tag; this.children=[]; this.attributes={}; this.value=''; this.scrollHeight=500; }
  set textContent(value) { this.value=String(value); this.children=[]; }
  get textContent() { return this.value+this.children.map(child=>child.textContent).join(''); }
  set innerHTML(value) { throw new Error('HTML non attendibile non deve essere interpretato'); }
  append(...children) { children.forEach(child=>{child.parent=this;this.children.push(child);}); }
  replaceChildren(...children) { this.value='';this.children=[];this.append(...children); }
  setAttribute(key,value) { this.attributes[key]=value; }
  remove() { this.parent.children=this.parent.children.filter(child=>child!==this); }
}
const document={createElement:tag=>new Element(tag)};
const setup=()=>{const container=new Element('div');return {container,chat:new ChatView(container,document)};};
const reply={message:'Ho creato il cubo rosso sul piano XY.',operations:[{op:'create',object:{id:'cube-1',name:'Cubo',type:'box',dimensions:{x:100,y:80,z:60},position:[0,0,30],color:'#ff0000'}}]};
test('Chat con messaggi distinti, spiegazione, misure applicate e JSON originale',()=>{
  const {container,chat}=setup(),turn=chat.start('Disegna un cubo rosso');
  assert.equal(turn.article.children[0].className,'chat-message user');
  assert.equal(turn.bubble.attributes['aria-busy'],'true');
  const raw=JSON.stringify(reply,null,2); chat.output(turn,raw); chat.complete(turn,reply,'1 operazione applicata');
  assert.equal(turn.raw.textContent,raw); assert.equal(turn.reply.textContent,reply.message);
  assert.ok(turn.operations.textContent.includes('100 mm')); assert.ok(turn.operations.textContent.includes('[0, 0, 30]'));
  assert.equal(turn.bubble.attributes['aria-busy'],'false'); assert.equal(turn.details.hidden,false);
  assert.equal(container.scrollTop,container.scrollHeight);
});
test('Errori leggibili con risposta rifiutata conservata e nessuna operazione mostrata come eseguita',()=>{
  const {chat}=setup(),turn=chat.start('<img src=x onerror=alert(1)>');
  chat.output(turn,'<script>alert(1)</script>'); chat.fail(turn,'JSON non valido');
  assert.equal(turn.raw.textContent,'<script>alert(1)</script>'); assert.equal(turn.reply.textContent,'JSON non valido');
  assert.equal(turn.operations.children.length,0); assert.equal(turn.details.open,true);
  assert.ok(turn.article.textContent.includes('<img src=x onerror=alert(1)>'));
});
test('Sessione chat limitata a 40 scambi interi e azzerata aprendo un progetto',()=>{
  const {chat,container}=setup();
  for(let i=0;i<41;i++) {const turn=chat.start('Comando '+i);chat.complete(turn,{operations:[]},'Nessuna operazione');}
  assert.equal(container.children.length,40); assert.equal(chat.turns.length,40);
  assert.equal(chat.messages().length,80); assert.equal(chat.messages()[0].content,'Comando 1');
  assert.equal(container.children[0].textContent.includes('Comando 0'),false);
  const last=chat.turns.at(-1); assert.equal(last.reply.textContent,'Nessuna operazione');
  assert.equal(last.details.open,false); last.details.open=true; assert.equal(last.details.open,true);
  chat.reset(); assert.equal(chat.turns.length,0); assert.equal(container.children.length,1);
});

test('La memoria conserva chiarimenti e ID applicati, esclude richieste in corso e segnala gli errori',()=>{
  const {chat}=setup();
  const first=chat.start('Crea un cubo');assert.deepEqual(chat.messages(),[]);
  chat.complete(first,reply,'1 operazione applicata');
  const question=chat.start('Aggiungi un’antenna');
  chat.complete(question,{message:'La preferisci conica o cilindrica?',operations:[]},'Nessuna operazione');
  const failed=chat.start('Cilindrica');chat.output(failed,'{"operations":[{"op":"execute","code":"evil"}]}');chat.fail(failed,'Risposta rifiutata');
  const messages=chat.messages();assert.equal(messages.length,6);
  assert.equal(messages[0].content,'Crea un cubo');
  assert.deepEqual(JSON.parse(messages[1].content),{message:reply.message,applied:true,objectIds:['cube-1']});
  assert.equal(JSON.parse(messages[3].content).message,'La preferisci conica o cilindrica?');
  assert.deepEqual(JSON.parse(messages[5].content),{message:'Risposta rifiutata',applied:false,objectIds:[]});
  assert.equal(JSON.stringify(messages).includes('evil'),false);
  messages[0].content='changed';assert.equal(chat.messages()[0].content,'Crea un cubo');
  chat.reset();assert.deepEqual(chat.messages(),[]);
});

test('Attesa animata senza testo visibile; fine e errore nascondono l’indicatore',()=>{
  const {chat}=setup(),turn=chat.start('Crea un cubo');
  assert.equal(turn.reply.textContent,'');assert.equal(turn.reply.hidden,true);
  assert.equal(turn.loading.className,'chat-typing');assert.equal(turn.loading.children.length,3);assert.equal(turn.loading.attributes.role,'status');assert.ok(turn.loading.attributes['aria-label']);
  assert.equal(turn.loading.hidden,false);chat.complete(turn,reply,'Fatto');assert.equal(turn.loading.hidden,true);assert.equal(turn.reply.hidden,false);
  const failed=chat.start('Altro');chat.fail(failed,'Errore');assert.equal(failed.loading.hidden,true);assert.equal(failed.reply.hidden,false);assert.equal(failed.reply.textContent,'Errore');
});
