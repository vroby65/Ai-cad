import { History, emptyProject } from './state.js';
import { interpretDeepSeek } from './api.js';
import { readKey, rememberKey, getBalance } from './account.js';
import { applyOperations, validateProject, newId } from './project.js';
import { CadView } from './renderer.js';
import { exportSTL } from './export.js';
import { importSTL, MAX_STL_BYTES } from './import.js';
import { decodeProject, encodeProject, download, filename, MAX_FILE_BYTES } from './files.js';
import { ChatView } from './chat.js';
import { setupChatResize } from './layout.js';

const $=id=>document.getElementById(id);
$('deepseek-key').value=readKey();
const history=new History(emptyProject());
const chat=new ChatView($('chat-messages'));
let selectedId=null, busy=false, view;
let balanceRequest=null,balanceVersion=0,balanceTimer;
function message(text,error=false) { $('status').textContent=text; $('status').className=error ? 'error' : busy ? 'busy' : ''; }
function setBusy(value) {
  busy=value;
  for(const id of ['run','open','save','export','import-stl','deepseek-key','clear-key','object-hole']) $(id).disabled=value;
  document.querySelectorAll('[data-example]').forEach(b=>b.disabled=value);
  $('undo').disabled=value||!history.canUndo; $('redo').disabled=value||!history.canRedo;
  $('command-form').setAttribute('aria-busy',String(value));
  $('run').textContent=value ? 'Elaborazione…' : 'Invia ↗';
}
function node(tag,text,className) { const n=document.createElement(tag); if(text!==undefined) n.textContent=text; if(className) n.className=className; return n; }
function select(id) { selectedId=id; view.select(id); renderObjects(); }
function renderObjects() {
  const state=history.current;
  const list=$('objects'); list.replaceChildren();
  $('object-count').textContent=state.objects.length;
  if(!state.objects.length) list.append(node('p','La scena è vuota. Parti da un’idea.','muted'));
  for(const o of state.objects) {
    const row=node('button',undefined,'object-row'+(o.id===selectedId ? ' selected' : ''));
    row.setAttribute('aria-pressed',String(o.id===selectedId));
    const swatch=node('span',undefined,'swatch'); swatch.style.backgroundColor=o.color;
    const text=node('span',undefined,'object-text'); text.append(node('span',o.name));
    const group=state.groups.find(g=>g.id===o.groupId);
    text.append(node('small',o.type+(o.hole ? ' · FORO' : '')+(group ? ` · ${group.name}` : '')));
    row.append(swatch,text); row.addEventListener('click',()=>select(o.id)); list.append(row);
  }
  const object=state.objects.find(o=>o.id===selectedId); $('properties').hidden=!object;
  $('hole-control').hidden=!object||object.type==='mesh';
  $('object-hole').checked=object?.hole===true;
  $('property-list').replaceChildren();
  if(object) {
    for(const [label,value] of [['ID',object.id],['Centro',object.position.join(', ')+' mm'],['Angoli',object.rotation.join(', ')+' °'],['Misure',Object.entries(object.dimensions).map(([k,v])=>`${k}: ${v}`).join(' · ')+' mm']]) {
      $('property-list').append(node('dt',label),node('dd',value));
    }
  }
}
function render(prepared) {
  const state=history.current;
  if(!state.objects.some(o=>o.id===selectedId)) selectedId=null;
  view.sync(state,prepared); view.select(selectedId); renderObjects();
  $('welcome').hidden=state.objects.length>0;
  $('undo').disabled=busy||!history.canUndo; $('redo').disabled=busy||!history.canRedo;
}
function commit(project,reset=false) {
  const prepared=view.prepare(project);
  if(reset) history.reset(project); else history.commit(project);
  render(prepared);
}
async function execute() {
  if(busy) return;
  const prompt=$('prompt').value.trim(); if(!prompt) { $('prompt').focus(); return; }
  const before=history.current;
  const turn=chat.start(prompt);
  setBusy(true); message('DeepSeek sta interpretando il comando…');
  try {
    const modelJson=await interpretDeepSeek(prompt,before,selectedId,{
      key:$('deepseek-key').value,
      onOutput:content=>chat.output(turn,content)
    });
    const updated=applyOperations(before,{operations:modelJson.operations});
    if(modelJson.operations.length) {
      commit(updated);
      if(!before.objects.length) view.frame();
    }
    const summary=modelJson.operations.length ? `${modelJson.operations.length} operazioni applicate · ${updated.objects.length} oggetti nella scena` : 'Nessuna operazione: prova a descrivere una forma o una trasformazione.';
    chat.complete(turn,modelJson,summary);
    if($('prompt').value.trim()===prompt) $('prompt').value='';
    message(summary);
  } catch(error) {
    chat.fail(turn,error.message);
    message(error.message,true);
  }
  finally { setBusy(false); $('status').classList.remove('busy'); refreshBalance(); }
}
async function loadProject(raw,reset) {
  setBusy(true); message('Controllo il progetto…');
  try {
    const project=decodeProject(raw);
    commit(project,reset);
    selectedId=null; view.select(null); renderObjects(); view.frame();
    chat.reset();
    message('Progetto pronto. Puoi continuare con un nuovo comando.');
  } catch(error) { message(error.message,true); }
  finally { setBusy(false); $('status').classList.remove('busy'); }
}
function keyStatus() {
  const deepseekReady=$('deepseek-key').value.trim();
  message(deepseekReady ? 'DeepSeek pronto.' : 'Inserisci la chiave API DeepSeek nel campo in alto.', !deepseekReady);
}
function cancelBalance() {
  clearTimeout(balanceTimer); balanceVersion++; balanceRequest?.abort(); balanceRequest=null;
}
async function refreshBalance() {
  cancelBalance();
  const key=$('deepseek-key').value.trim(),version=balanceVersion;
  const output=$('deepseek-balance');
  output.className=''; output.textContent=key ? 'Credito: aggiornamento…' : 'Credito: —';
  if(!key) return;
  balanceRequest=new AbortController();
  try {
    const balance=await getBalance(key,balanceRequest.signal);
    if(version!==balanceVersion) return;
    output.textContent='Credito: '+balance.balances.map(info=>`${info.total.replace('.',',')} ${info.currency}`).join(' · ')+(balance.available ? '' : ' · credito insufficiente');
    output.className=balance.available ? '' : 'error';
  } catch(error) {
    if(version!==balanceVersion) return;
    output.textContent=error.message; output.className='error';
  } finally { if(version===balanceVersion) balanceRequest=null; }
}
try { view=new CadView($('viewport'),select); render(); }
catch(error) {
  message('Visualizzatore non disponibile: attiva WebGL nel browser e ricarica la pagina.',true);
  $('run').disabled=true; throw error;
}
setupChatResize($('editor'),$('chat'),$('chat-resizer'));
$('command-form').addEventListener('submit',e=>{ e.preventDefault(); execute(); });
$('prompt').addEventListener('keydown',e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) { e.preventDefault(); execute(); } });
$('undo').addEventListener('click',()=>{ history.undo(); render(); message('Ultima modifica annullata.'); });
$('redo').addEventListener('click',()=>{ history.redo(); render(); message('Modifica ripristinata.'); });
$('object-hole').addEventListener('change',()=>{
  if(busy||!selectedId) { renderObjects(); return; }
  try {
    const project=applyOperations(history.current,{operations:[{op:'update',id:selectedId,changes:{hole:$('object-hole').checked}}]});
    commit(project); message($('object-hole').checked ? 'Forma foro: sottrae materiale ai pieni nello stesso gruppo.' : 'Forma riportata a pieno.');
  } catch(error) { renderObjects(); message(error.message,true); }
});
$('frame').addEventListener('click',()=>view.frame());
$('toggle-panel').addEventListener('click',()=>{
  const closed=$('workspace').classList.toggle('panel-closed'); $('toggle-panel').setAttribute('aria-expanded',String(!closed));
});
if(matchMedia('(max-width: 620px)').matches) { $('workspace').classList.add('panel-closed'); $('toggle-panel').setAttribute('aria-expanded','false'); }
function saveKey() {
  const saved=rememberKey(undefined,$('deepseek-key').value);
  const hasKey=Boolean($('deepseek-key').value.trim());
  $('key-note').textContent=saved ? hasKey ? 'Chiave salvata in questo browser · usa Cancella per dimenticarla.' : 'Chiave cancellata dal browser.' : hasKey ? 'Il browser non consente il salvataggio · chiave disponibile solo in questa pagina.' : 'Impossibile eliminare la chiave dallo storage del browser.';
  keyStatus(); cancelBalance();
  if(!saved) message($('key-note').textContent,true);
  $('deepseek-balance').className='';
  $('deepseek-balance').textContent=$('deepseek-key').value.trim() ? 'Credito: aggiornamento…' : 'Credito: —';
  if(hasKey) balanceTimer=setTimeout(refreshBalance,600);
}
$('deepseek-key').addEventListener('input',saveKey);
$('clear-key').addEventListener('click',()=>{ $('deepseek-key').value=''; saveKey(); $('deepseek-key').focus(); });
window.addEventListener('pagehide',cancelBalance);
$('save').addEventListener('click',()=>{
  try { const state=history.current; download(encodeProject(state),filename(state.name,'json'),'application/json'); message('File JSON preparato per il download.'); }
  catch(error) { message(error.message,true); }
});
$('export').addEventListener('click',()=>{
  try { const state=history.current; download(exportSTL(state),filename(state.name,'stl'),'model/stl'); message('STL triangolato preparato per il download (coordinate in mm).'); }
  catch(error) { message(error.message,true); }
});
$('open').addEventListener('click',()=>{
  if(history.current.objects.length&&!confirm('Hai salvato il progetto attuale? Aprire un file sostituirà la scena e la cronologia degli stati.')) return;
  $('file').click();
});
$('file').addEventListener('change',async()=>{
  const file=$('file').files[0]; $('file').value=''; if(!file) return;
  if(file.size>MAX_FILE_BYTES) { message('File troppo grande (massimo 8 MiB).',true); return; }
  try { await loadProject(await file.text(),true); } catch { message('Impossibile leggere il file.',true); }
});
$('import-stl').addEventListener('click',()=>$('stl-file').click());
$('stl-file').addEventListener('change',async()=>{
  const file=$('stl-file').files[0]; $('stl-file').value=''; if(!file || busy) return;
  if(file.size>MAX_STL_BYTES) { message('STL troppo grande (massimo 10 MiB).',true); return; }
  setBusy(true); message('Importo e controllo il file STL…');
  try {
    const before=history.current;
    const mesh=importSTL(await file.arrayBuffer(),file.name,newId(before,'stl'));
    const updated=validateProject({...before,objects:[...before.objects,mesh]});
    commit(updated); select(mesh.id); view.frame();
    message('STL aggiunto alla scena. Puoi selezionarlo, trasformarlo ed esportarlo.');
  } catch(error) { message(error.message,true); }
  finally { setBusy(false); $('status').classList.remove('busy'); }
});
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',async()=>{
  if(busy) return;
  setBusy(true); message('Apro il progetto di esempio…');
  try {
    const response=await fetch(`examples/${button.dataset.example}.json`);
    if(!response.ok) throw new Error('Esempio non disponibile.');
    await loadProject(await response.text(),false);
  } catch(error) { message(error.message,true); } finally { setBusy(false); }
}));
keyStatus();
refreshBalance();
