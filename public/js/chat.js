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
    this.container.replaceChildren(this.node('p','Descrivi una forma: qui troverai la risposta di DeepSeek e i dettagli delle modifiche.','chat-empty'));
  }
  scroll() { this.container.scrollTop=this.container.scrollHeight; }
  start(prompt) {
    if(!this.turns.length) this.container.replaceChildren();
    const article=this.node('article',undefined,'chat-turn');
    const user=this.node('div',undefined,'chat-message user');
    user.append(this.node('span','Tu','chat-author'),this.node('p',prompt,'chat-text'));
    const bubble=this.node('div',undefined,'chat-message assistant'); bubble.setAttribute('aria-busy','true');
    const reply=this.node('p','Sto interpretando il tuo comando…','chat-text');
    const summary=this.node('p','','chat-summary'),operations=this.node('ol',undefined,'chat-operations');
    const details=this.node('details',undefined,'chat-json'); details.open=false; details.hidden=true;
    const raw=this.node('pre',''); details.append(this.node('summary','Risposta completa · JSON'),raw);
    bubble.append(this.node('span','DeepSeek · Flash','chat-author'),reply,summary,operations,details);
    article.append(user,bubble); this.container.append(article);
    const turn={article,bubble,reply,summary,operations,details,raw}; this.turns.push(turn);
    if(this.turns.length>40) this.turns.shift().article.remove();
    this.scroll(); return turn;
  }
  output(turn,content) { turn.raw.textContent=content; turn.details.hidden=false; this.scroll(); }
  complete(turn,response,summary) {
    turn.reply.textContent=response.message||summary;
    turn.summary.textContent=response.message ? summary : '';
    turn.operations.replaceChildren(...response.operations.map(op=>this.node('li',explain(op))));
    turn.bubble.setAttribute('aria-busy','false'); this.scroll();
  }
  fail(turn,error) {
    turn.reply.textContent=error; turn.summary.textContent='Nessuna modifica applicata.';
    turn.bubble.className='chat-message assistant error'; turn.bubble.setAttribute('aria-busy','false');
    turn.operations.replaceChildren(); turn.details.open=true; this.scroll();
  }
}
