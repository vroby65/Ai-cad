import { History, emptyProject } from './state.js';
import { interpretAI, getModels } from './api.js';
import { readKey, rememberKey, readURL, rememberURL } from './account.js';
import { applyOperations, validateProject, newId } from './project.js';
import { CadView } from './renderer.js';
import { exportOBJ, exportSTL } from './export.js';
import { importSTL, MAX_STL_BYTES } from './import.js';
import { decodeProject, encodeProject, download, filename, MAX_FILE_BYTES } from './files.js';
import { ChatView } from './chat.js';
import { setupChatResize } from './layout.js';
import { PropertyEditor } from './properties.js';
import { Diagnostics } from './diagnostics.js';
import { localDiagnostics } from './local-diagnostics.js';
import { prepareReferenceImage } from './image-attachment.js';

const $=id=>document.getElementById(id);
let logTimer;
const diagnostics=new Diagnostics(()=>$('api-key').value,()=>{
  $('diagnostic-output').textContent=diagnostics.export();
  $('diagnostic-count').textContent=String(diagnostics.entries.length);
  clearTimeout(logTimer);logTimer=setTimeout(saveLocalLogs,200);
});
const saveLocalLogs=localDiagnostics(diagnostics);
$('download-log').addEventListener('click',()=>download(diagnostics.export(),'aicad-diagnostics.json','application/json'));
$('clear-log').addEventListener('click',()=>diagnostics.clear());
window.addEventListener('error',event=>{diagnostics.record('runtime-error',{message:event.message,line:event.lineno});$('diagnostics').open=true;});
window.addEventListener('unhandledrejection',event=>{diagnostics.record('runtime-error',{message:event.reason?.message||String(event.reason)});$('diagnostics').open=true;});
diagnostics.record('startup',{build:'aicad-gateway-1'});
$('api-key').value=readKey();
$('gateway-url').value=readURL();
const history=new History(emptyProject());
const chat=new ChatView($('chat-messages'));
let selectedId=null, busy=false, view,currentFitReport=[],attachedImage=null;
let connectionRequest=null,connectionVersion=0,connectionTimer;
let activeModel=null,availableModels=[];
$('reasoning-effort').value='medium';
const propertyEditor=new PropertyEditor($('property-form'),$('property-fields'),$('property-error'),operation=>{
  commit(applyOperations(history.current,{operations:[operation]}));
  message('Object properties updated.');
});
function message(text,error=false) {
  $('status').textContent=text; $('status').className=error ? 'error' : busy ? 'busy' : '';
  if(error) diagnostics.record('ui-error',{message:text});
}
function setBusy(value) {
  busy=value;
  propertyEditor.setBusy(value);
  for(const id of ['run','new','open','save','export','export-obj','import-stl','api-key','gateway-url','clear-key','reasoning-effort','object-hole','visual-review','attach-image','remove-image']) $(id).disabled=value;
  $('model-select').disabled=value||!activeModel;
  document.querySelectorAll('[data-example]').forEach(b=>b.disabled=value);
  $('undo').disabled=value||!history.canUndo; $('redo').disabled=value||!history.canRedo;
  $('command-form').setAttribute('aria-busy',String(value));
  updateReviewButton();
}
function node(tag,text,className) { const n=document.createElement(tag); if(text!==undefined) n.textContent=text; if(className) n.className=className; return n; }
function clearAttachedImage() {
  attachedImage=null;$('image-file').value='';$('image-preview').src='';$('image-name').textContent='';$('image-attachment').hidden=true;
}
function updateReviewButton() {
  $('visual-review').disabled=busy||!activeModel||!history.current.objects.some(object=>object.hole!==true);
}
function renderFitReport(reports) {
  const section=$('fit-check'),results=$('fit-results');section.hidden=!reports.length;results.replaceChildren();
  for(const report of reports) {
    let detail;
    if(report.status==='penetrating') detail='penetrates by '+report.overlapVolume.toFixed(2)+' mm³';
    else if(report.status==='too-far') detail='gap '+report.clearance.toFixed(2)+' mm exceeds '+report.tolerance+' mm';
    else if(report.status==='within-tolerance') detail='gap '+report.clearance.toFixed(2)+' mm within '+report.tolerance+' mm';
    else detail=report.reason;
    results.append(node('div',report.objectName+' → '+report.targetName+': '+detail,'fit-result '+report.status));
  }
}
function select(id) { selectedId=id; view.select(id); renderObjects(); }
function renderObjects() {
  const state=history.current;
  const list=$('objects'); list.replaceChildren();
  $('object-count').textContent=state.objects.length;
  if(!state.objects.length) list.append(node('p','The scene is empty. Start with an idea.','muted'));
  for(const o of state.objects) {
    const row=node('button',undefined,'object-row'+(o.id===selectedId ? ' selected' : ''));
    row.setAttribute('aria-pressed',String(o.id===selectedId));
    const swatch=node('span',undefined,'swatch'); swatch.style.backgroundColor=o.color;
    const text=node('span',undefined,'object-text'); text.append(node('span',o.name));
    const group=state.groups.find(g=>g.id===o.groupId);
    text.append(node('small',o.type+(o.hole ? ' · HOLE' : '')+(group ? ` · ${group.name}` : '')));
    row.append(swatch,text); row.addEventListener('click',()=>select(o.id)); list.append(row);
  }
  const object=state.objects.find(o=>o.id===selectedId); $('properties').hidden=!object;
  $('hole-control').hidden=!object||object.type==='mesh';
  $('object-hole').checked=object?.hole===true;
  $('property-list').replaceChildren();
  if(object) {
    for(const [label,value] of [['ID',object.id],['Type',object.type]]) {
      $('property-list').append(node('dt',label),node('dd',value));
    }
    if(object.hole && object.targetIds) $('property-list').append(node('dt','Cuts'),node('dd',object.targetIds.map(id=>state.objects.find(o=>o.id===id).name).join(' · ')||'No solids'));
    if(object.fit) $('property-list').append(node('dt','Glass fit'),node('dd',object.fit.targetIds.join(' · ')+' · '+object.fit.maxGap+' mm'));
  }
  propertyEditor.render(object,busy);
}
function render(prepared) {
  const state=history.current;
  if(!state.objects.some(o=>o.id===selectedId)) selectedId=null;
  view.sync(state,prepared); view.select(selectedId); renderObjects();
  currentFitReport=view.analyzeFits?.(state)||[];renderFitReport(currentFitReport);
  $('welcome').hidden=state.objects.length>0;
  $('undo').disabled=busy||!history.canUndo; $('redo').disabled=busy||!history.canRedo;
  updateReviewButton();
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
  const messages=chat.messages();
  const turn=chat.start(prompt);
  const started=performance.now();let phase='interpret';
  diagnostics.record('command',{prompt,selectedId,referenceImage:Boolean(attachedImage),project:{...before,objects:before.objects.map(({vertices,...object})=>({...object,...(vertices?{triangleCount:vertices.length/9}:{})}))}});
  setBusy(true); message('');
  try {
    const modelJson=await interpretAI(prompt,before,selectedId,{
      key:$('api-key').value,url:$('gateway-url').value,model:activeModel,
      effort:$('reasoning-effort').value,
      messages,images:attachedImage?[attachedImage]:[],
      onDiagnostic:(stage,data)=>diagnostics.record(stage,data),
      onOutput:content=>{diagnostics.record('output',{content});chat.output(turn,content);}
    });
    phase='operations';
    const updated=applyOperations(before,{operations:modelJson.operations});
    if(modelJson.operations.length) {
      phase='geometry';diagnostics.record('geometry',{objects:updated.objects.length});
      commit(updated);
      if(!before.objects.length) view.frame();
    }
    phase='chat';
    const summary=modelJson.operations.length ? `${modelJson.operations.length} operations applied · ${updated.objects.length} objects in the scene` : 'No operations: try describing a shape or transformation.';
    chat.complete(turn,modelJson,summary);
    if($('prompt').value.trim()===prompt) $('prompt').value='';
    clearAttachedImage();
    message(summary);
    diagnostics.record('applied',{operations:modelJson.operations.length,objects:updated.objects.length,elapsedMs:Math.round(performance.now()-started)});
  } catch(error) {
    diagnostics.record('failed',{phase,message:error.message,elapsedMs:Math.round(performance.now()-started)});
    $('diagnostics').open=true;
    chat.fail(turn,error.message);
    message(error.message,true);
  }
  finally { setBusy(false); $('status').classList.remove('busy'); refreshConnection(); }
}
async function reviewScene() {
  if(busy||!history.current.objects.some(object=>object.hole!==true)) return;
  const before=history.current,messages=chat.messages();
  const displayPrompt='Visual review of the current scene';
  const command='Review the attached three-view scene and correct visible alignment, proportion, or glass-fit problems. Treat fitAnalysis as authoritative geometry data. Preserve unrelated parts. If no correction is needed, return operations:[].';
  const turn=chat.start(displayPrompt),started=performance.now();let phase='capture';
  diagnostics.record('command',{prompt:displayPrompt,selectedId,visualReview:true,fitAnalysis:currentFitReport});
  setBusy(true);message('Capturing perspective, side and front views…');
  try {
    const image=await view.captureReviewImage();
    phase='interpret';
    const modelJson=await interpretAI(command,before,selectedId,{
      key:$('api-key').value,url:$('gateway-url').value,model:activeModel,
      effort:$('reasoning-effort').value,messages,images:[image],fitAnalysis:currentFitReport,
      onDiagnostic:(stage,data)=>diagnostics.record(stage,data),
      onOutput:content=>{diagnostics.record('output',{content});chat.output(turn,content);}
    });
    phase='operations';
    const updated=applyOperations(before,{operations:modelJson.operations});
    if(modelJson.operations.length) { phase='geometry';commit(updated); }
    phase='chat';
    const summary=modelJson.operations.length ? 'Visual review: '+modelJson.operations.length+' corrections applied · '+updated.objects.length+' objects in the scene' : 'Visual review complete · no corrections needed.';
    chat.complete(turn,modelJson,summary);message(summary);
    diagnostics.record('applied',{visualReview:true,operations:modelJson.operations.length,objects:updated.objects.length,elapsedMs:Math.round(performance.now()-started)});
  } catch(error) {
    diagnostics.record('failed',{phase,message:error.message,elapsedMs:Math.round(performance.now()-started)});
    $('diagnostics').open=true;chat.fail(turn,error.message);message(error.message,true);
  } finally { setBusy(false);$('status').classList.remove('busy');refreshConnection(); }
}
async function loadProject(raw,reset) {
  setBusy(true); message('Checking the project…');
  try {
    const project=decodeProject(raw);
    commit(project,reset);
    selectedId=null; view.select(null); renderObjects(); view.frame();
    chat.reset();
    message('Project ready. You can continue with a new command.');
  } catch(error) { message(error.message,true); }
  finally { setBusy(false); $('status').classList.remove('busy'); }
}
function keyStatus() {
  const ready=$('api-key').value.trim()&&$('gateway-url').value.trim();
  message(ready ? 'AI gateway configured.' : 'Enter the gateway URL:port and API key at the top.', !ready);
}
function resetModels() {
  const option=node('option','Model');option.value='';
  $('model-select').replaceChildren(option);$('model-select').value='';$('model-select').disabled=true;
  availableModels=[];
  updateReviewButton();
}
function cancelConnection(reset=false) {
  clearTimeout(connectionTimer); connectionVersion++; connectionRequest?.abort(); connectionRequest=null;
  activeModel=null;$('model-select').disabled=true;
  if(reset) resetModels();
}
async function refreshConnection() {
  const previous=$('model-select').value;
  cancelConnection();
  const key=$('api-key').value.trim(),url=$('gateway-url').value.trim(),version=connectionVersion;
  const output=$('gateway-status');
  output.className='';output.textContent=key&&url ? 'Connecting…' : 'Gateway: not connected';
  if(!key||!url) { resetModels();return; }
  connectionRequest=new AbortController();
  try {
    const models=await getModels(url,key,connectionRequest.signal);
    if(version!==connectionVersion) return;
    availableModels=models;
    $('model-select').replaceChildren(...models.map(model=>{const option=node('option',model.name);option.value=model.id;return option;}));
    activeModel=models.some(model=>model.id===previous) ? previous : models[0].id;
    $('model-select').value=activeModel;$('model-select').disabled=busy;
    updateReviewButton();
    output.textContent='AI: '+models.find(model=>model.id===activeModel).name;
  } catch(error) {
    if(version!==connectionVersion) return;
    resetModels();
    output.textContent=error.message;output.className='error';
  } finally { if(version===connectionVersion) connectionRequest=null; }
}
try { view=new CadView($('viewport'),select); render(); }
catch(error) {
  diagnostics.record('webgl-error',{message:error.message});
  $('diagnostics').open=true;
  message('Viewer unavailable: enable WebGL in your browser and reload the page.',true);
  $('run').disabled=true; throw error;
}
setupChatResize($('editor'),$('chat'),$('chat-resizer'));
clearAttachedImage();
$('command-form').addEventListener('submit',e=>{ e.preventDefault(); execute(); });
$('prompt').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229) { e.preventDefault(); execute(); } });
$('new').addEventListener('click',()=>{
  if(busy) return;
  const hasWork=history.current.objects.length||history.canUndo||history.canRedo||chat.turns.length||$('prompt').value.trim()||attachedImage;
  if(hasWork&&!confirm('Have you saved your project? New will clear the scene, chat and undo/redo history.')) return;
  try {
    commit(emptyProject(),true); chat.reset(); $('prompt').value=''; clearAttachedImage(); view.frame();
    keyStatus(); $('prompt').focus();
  } catch(error) { message(error.message,true); }
});
$('undo').addEventListener('click',()=>{ history.undo(); render(); message('Last change undone.'); });
$('redo').addEventListener('click',()=>{ history.redo(); render(); message('Change restored.'); });
$('object-hole').addEventListener('change',()=>{
  if(busy||!selectedId) { renderObjects(); return; }
  try {
    const project=applyOperations(history.current,{operations:[{op:'update',id:selectedId,changes:{hole:$('object-hole').checked}}]});
    commit(project); message($('object-hole').checked ? 'Hole tool: cuts linked targets, or solids in the same group when no targets are linked.' : 'Shape restored to a solid.');
  } catch(error) { renderObjects(); message(error.message,true); }
});
$('frame').addEventListener('click',()=>view.frame());
$('visual-review').addEventListener('click',reviewScene);
$('attach-image').addEventListener('click',()=>{if(!busy)$('image-file').click();});
$('remove-image').addEventListener('click',clearAttachedImage);
$('image-file').addEventListener('change',async()=>{
  const file=$('image-file').files[0];$('image-file').value='';if(!file||busy)return;
  $('attach-image').disabled=true;message('Preparing reference image…');
  try {
    attachedImage=await prepareReferenceImage(file);
    $('image-preview').src=attachedImage;$('image-name').textContent=file.name;$('image-attachment').hidden=false;
    message('Reference image ready for the next message.');
  } catch(error) { message(error.message,true); }
  finally { $('attach-image').disabled=busy; }
});
$('toggle-panel').addEventListener('click',()=>{
  const closed=$('workspace').classList.toggle('panel-closed'); $('toggle-panel').setAttribute('aria-expanded',String(!closed));
});
if(matchMedia('(max-width: 620px)').matches) { $('workspace').classList.add('panel-closed'); $('toggle-panel').setAttribute('aria-expanded','false'); }
function saveKey() {
  const saved=rememberKey(undefined,$('api-key').value);
  const hasKey=Boolean($('api-key').value.trim());
  $('key-note').textContent=saved ? hasKey ? 'Key saved in this browser · use Clear to forget it.' : 'Key removed from the browser.' : hasKey ? 'Browser storage unavailable · the key is kept only in this page.' : 'Unable to remove the key from browser storage.';
  keyStatus(); cancelConnection(true);
  if(!saved) message($('key-note').textContent,true);
  $('gateway-status').className='';
  $('gateway-status').textContent='Gateway: not connected';
  if(hasKey&&$('gateway-url').value.trim()) connectionTimer=setTimeout(refreshConnection,600);
}
$('api-key').addEventListener('input',saveKey);
$('gateway-url').addEventListener('input',()=>{
  const saved=rememberURL(undefined,$('gateway-url').value);
  saveKey();
  if(!saved) message('Browser storage unavailable; the URL is kept only in this page.',true);
});
$('model-select').addEventListener('change',()=>{
  activeModel=$('model-select').value;
  const model=availableModels.find(item=>item.id===activeModel);
  if(model) $('gateway-status').textContent='AI: '+model.name;
  updateReviewButton();
});
$('clear-key').addEventListener('click',()=>{ $('api-key').value=''; saveKey(); $('api-key').focus(); });
window.addEventListener('pagehide',()=>cancelConnection());
$('save').addEventListener('click',()=>{
  try { const state=history.current; download(encodeProject(state),filename(state.name,'json'),'application/json'); message('JSON file ready to download.'); }
  catch(error) { message(error.message,true); }
});
$('export').addEventListener('click',()=>{
  try { const state=history.current; download(exportSTL(state),filename(state.name,'stl'),'model/stl'); message('Triangulated STL ready to download (coordinates in mm).'); }
  catch(error) { message(error.message,true); }
});
$('export-obj').addEventListener('click',()=>{
  try { const state=history.current; download(exportOBJ(state),filename(state.name,'obj'),'model/obj'); message('Triangulated OBJ ready to download (coordinates in mm; geometry only).'); }
  catch(error) { message(error.message,true); }
});
$('open').addEventListener('click',()=>{
  if(history.current.objects.length&&!confirm('Have you saved your current project? Opening a file will replace the scene and history.')) return;
  $('file').click();
});
$('file').addEventListener('change',async()=>{
  const file=$('file').files[0]; $('file').value=''; if(!file) return;
  if(file.size>MAX_FILE_BYTES) { message('File too large (maximum 8 MiB).',true); return; }
  try { await loadProject(await file.text(),true); } catch { message('Unable to read the file.',true); }
});
$('import-stl').addEventListener('click',()=>$('stl-file').click());
$('stl-file').addEventListener('change',async()=>{
  const file=$('stl-file').files[0]; $('stl-file').value=''; if(!file || busy) return;
  if(file.size>MAX_STL_BYTES) { message('STL too large (maximum 10 MiB).',true); return; }
  setBusy(true); message('Importing and checking the STL file…');
  try {
    const before=history.current;
    const mesh=importSTL(await file.arrayBuffer(),file.name,newId(before,'stl'));
    const updated=validateProject({...before,objects:[...before.objects,mesh]});
    commit(updated); select(mesh.id); view.frame();
    message('STL added to the scene. You can select, transform and export it.');
  } catch(error) { message(error.message,true); }
  finally { setBusy(false); $('status').classList.remove('busy'); }
});
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',async()=>{
  if(busy) return;
  setBusy(true); message('Opening the example project…');
  try {
    const response=await fetch(`examples/${button.dataset.example}.json`);
    if(!response.ok) throw new Error('Example unavailable.');
    await loadProject(await response.text(),false);
  } catch(error) { message(error.message,true); } finally { setBusy(false); }
}));
keyStatus();
refreshConnection();
