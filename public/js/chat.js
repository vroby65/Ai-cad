import { explain } from './explain.js';

export class ChatView {
  constructor(container,document=globalThis.document) { this.container=container; this.document=document; this.reset(); }
  node(tag,text,className) {
    const node=this.document.createElement(tag);
    if(text!==undefined) node.textContent=text;
    if(className) node.className=className;
    return node;
  }
  reset() {
    this.turns=[];
    this.container.replaceChildren(this.node('p','Describe a shape: the AI response and change details will appear here.','chat-empty'));
  }
  scroll() { this.container.scrollTop=this.container.scrollHeight; }
  start(prompt) {
    if(!this.turns.length) this.container.replaceChildren();
    const article=this.node('article',undefined,'chat-turn');
    const user=this.node('div',undefined,'chat-message user');
    user.append(this.node('span','You','chat-author'),this.node('p',prompt,'chat-text'));
    const bubble=this.node('div',undefined,'chat-message assistant'); bubble.setAttribute('aria-busy','true');
    const loading=this.node('div',undefined,'chat-typing'); loading.hidden=false;
    loading.setAttribute('role','status'); loading.setAttribute('aria-label','The AI is preparing a response');
    for(let i=0;i<3;i++) { const dot=this.node('span'); dot.setAttribute('aria-hidden','true'); loading.append(dot); }
    const reply=this.node('p','','chat-text'); reply.hidden=true;
    const summary=this.node('p','','chat-summary'),operations=this.node('ol',undefined,'chat-operations');
    const details=this.node('details',undefined,'chat-json'); details.open=false; details.hidden=true;
    const raw=this.node('pre',''); details.append(this.node('summary','Full response · JSON'),raw);
    bubble.append(this.node('span','AIcad assistant','chat-author'),loading,reply,summary,operations,details);
    article.append(user,bubble); this.container.append(article);
    const turn={article,bubble,loading,reply,summary,operations,details,raw,prompt,context:null}; this.turns.push(turn);
    if(this.turns.length>40) this.turns.shift().article.remove();
    this.scroll(); return turn;
  }
  output(turn,content) { turn.raw.textContent=content; turn.details.hidden=false; this.scroll(); }
  complete(turn,response,summary) {
    turn.loading.hidden=true; turn.reply.hidden=false;
    const objectIds=[...new Set(response.operations.flatMap(op=>[op.object?.id,op.id,op.newId,...(op.ids||[]),...(op.toolIds||[])].filter(Boolean)))];
    turn.context=JSON.stringify({message:response.message||summary,applied:true,objectIds});
    turn.reply.textContent=response.message||summary;
    turn.summary.textContent=response.message ? summary : '';
    turn.operations.replaceChildren(...response.operations.map(op=>this.node('li',explain(op))));
    turn.bubble.setAttribute('aria-busy','false'); this.scroll();
  }
  fail(turn,error) {
    turn.loading.hidden=true; turn.reply.hidden=false;
    turn.context=JSON.stringify({message:error,applied:false,objectIds:[]});
    turn.reply.textContent=error; turn.summary.textContent='No changes applied.';
    turn.bubble.className='chat-message assistant error'; turn.bubble.setAttribute('aria-busy','false');
    turn.operations.replaceChildren(); turn.details.open=true; this.scroll();
  }
  messages() {
    return this.turns.filter(turn=>turn.context!==null).flatMap(turn=>[
      {role:'user',content:turn.prompt},{role:'assistant',content:turn.context}
    ]);
  }
}
