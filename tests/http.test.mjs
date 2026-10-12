import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStaticServer} from '../scripts/serve.mjs';
let server,base;
before(async()=>{
  server=createStaticServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
test('App e dipendenze funzionano con un server statico, senza PHP',async()=>{
  const html=await (await fetch(base)).text();
  assert.match(html,/id="deepseek-key" type="password"/);
  assert.match(html,/id="deepseek-balance"/);
  assert.match(html,/id="clear-key"/);
  assert.match(html,/<button id="new"[^>]*aria-label="Nuovo progetto"/);
  assert.equal(html.includes('Ctrl + Invio'),false);
  assert.match(html,/Invio · Maiusc \+ Invio: a capo/);
  assert.match(html,/id="chat-messages" role="log"/);
  assert.match(html,/id="object-hole" type="checkbox"/);
  assert.equal(html.includes('id="activity-list"'),false);
  assert.equal(html.includes('id="mode"'),false);
  assert.equal(html.includes('demo-command'),false);
  assert.match(html,/id="import-stl"/); assert.match(html,/id="export"/);
  const modules=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
  assert.equal(modules.includes('api.php'),false);
  assert.equal(modules.includes('demo.js'),false);
  for(const path of ['/','/js/app.js','/js/chat.js','/js/properties.js','/js/boolean.js','/js/geometry.js','/js/project.js','/js/api.js','/js/account.js','/js/import.js','/vendor/csg-lib.js','/vendor/three.module.js','/vendor/three.core.js','/vendor/OrbitControls.js','/vendor/STLExporter.js','/vendor/STLLoader.js']) assert.equal((await fetch(base+path)).status,200);
  assert.match(html,/<form id="property-form"><fieldset id="property-fields">/);
  assert.match(html,/id="property-error"[^>]*aria-live="polite"/);
});
test('Solo file pubblici: backend ritirato, chiavi e sorgenti privati non esposti',async()=>{
  for(const path of ['/api.php','/.env','/.git/config','/legacy/api.php','/legacy/src/Config.php','/%2e%2e/legacy/api.php']) assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base,{method:'POST',body:'{}'})).status,405);
});
test('Gli esempi sono disponibili come JSON statici',async()=>{
  for(const name of ['house','robot','car']) {
    const response=await fetch(`${base}/examples/${name}.json`); assert.equal(response.status,200);
    assert.ok((await response.json()).objects.length>0);
  }
});
test('Testata compatta con account, nessuna modalità CoderDojo e chat ridimensionabile',async()=>{
  const html=await (await fetch(base)).text(),header=html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
  for(const id of ['deepseek-key','clear-key','deepseek-balance']) assert.ok(header?.includes(`id="${id}"`));
  assert.equal(html.includes('id="teaching"'),false); assert.equal(html.includes('id="project-name"'),false);
  assert.match(html,/id="chat-resizer"[^>]*role="separator"/);
  assert.match(html,/id="prompt" rows="1"/);
  const app=await (await fetch(base+'/js/app.js')).text();
  assert.equal(app.includes("$('teaching')"),false); assert.equal(app.includes("$('project-name')"),false);
  assert.ok(app.includes('setupChatResize')); assert.equal((await fetch(base+'/js/layout.js')).status,200);
});
