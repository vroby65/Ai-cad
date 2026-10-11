import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
let server,base;
const empty={version:1,name:'Prova',units:'mm',objects:[],groups:[]};
before(async()=>{
  const probe=createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const port=probe.address().port;
  await new Promise(r=>probe.close(r)); base=`http://127.0.0.1:${port}`;
  server=spawn('php',['-S',`127.0.0.1:${port}`,'-t','public','legacy/router.php'],{cwd:new URL('..',import.meta.url),env:{...process.env,DEEPSEEK_API_KEY:'',DEEPSEEK_MODEL:'',DEEPCAD_ENV_FILE:'/nonexistent/deepcad-test.env'},stdio:'ignore'});
  for(let i=0;i<50;i++) { try { await fetch(base); return; } catch { await delay(100); } }
  throw new Error('Server PHP non avviato');
});
after(()=>server?.kill());
async function post(action,body,headers={}) {
  const response=await fetch(`${base}/api.php?action=${action}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
const command=(project,prompt,mode='demo')=>post('command',{project,prompt,mode,selectedId:null});
test('Risorse locali e configurazione senza segreti',async()=>{
  for(const path of ['/','/js/app.js','/vendor/three.module.js','/vendor/three.core.js','/vendor/OrbitControls.js','/vendor/STLExporter.js']) assert.equal((await fetch(base+path)).status,200);
  const config=await (await fetch(base+'/api.php?action=config')).json();
  assert.equal(config.deepseekReady,false); assert.ok(config.demoPrompts.length>=12);
  assert.deepEqual(Object.keys(config).sort(),['deepseekReady','demoPrompts']);
  for(const path of ['/.env','/src/Config.php','/tests/run.php','/../src/Config.php','/.git/config']) assert.equal((await fetch(base+path)).status,404);
});
test('Flusso HTTP: prompt, modifica, save/load, nuovi comandi',async()=>{
  const cube=await command(empty,'Disegna un cubo rosso di 100 mm.'); assert.equal(cube.status,200); assert.equal(cube.body.project.objects.length,1);
  const cylinder=await command(cube.body.project,'Aggiungi un cilindro sopra il cubo.'); assert.equal(cylinder.body.project.objects[1].position[2],130);
  const saved=JSON.stringify(cylinder.body.project);
  const opened=await post('validate',{project:JSON.parse(saved)}); assert.equal(opened.status,200); assert.deepEqual(opened.body.project,cylinder.body.project);
  const deleted=await command(opened.body.project,'Elimina il cilindro.'); assert.equal(deleted.body.project.objects.length,1);
});
test('I tre esempi si aprono e restano modificabili',async()=>{
  for(const name of ['house','robot','car']) {
    const project=JSON.parse(await readFile(new URL(`../public/examples/${name}.json`,import.meta.url),'utf8'));
    assert.equal((await post('validate',{project})).status,200);
    const result=await command(project,'Crea una sfera blu di raggio 40 mm.');
    assert.equal(result.body.project.objects.length,project.objects.length+1);
  }
});
test('Rifiuta JSON malformato, schema ostile, grandi upload e cross-origin',async()=>{
  const invalid=await fetch(base+'/api.php?action=command',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"broken"'}); assert.equal(invalid.status,422);
  assert.equal((await post('validate',{project:{...empty,path:'../../etc/passwd'}})).status,422);
  assert.equal((await post('validate',{project:empty},{Origin:'https://evil.example'})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{
    const req=httpRequest(base+'/api.php?action=config',{headers:{Host:'evil.example'}},response=>{response.resume(); resolve(response.statusCode);});
    req.on('error',reject); req.end();
  });
  assert.equal(wrongHost,403);
  assert.equal((await post('validate',{project:empty},{'Content-Type':'text/plain'})).status,415);
  assert.equal((await post('validate',{project:empty},{'Content-Type':'application/json-other'})).status,415);
  const large=await fetch(base+'/api.php?action=validate',{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(524289)}); assert.equal(large.status,413);
  assert.equal((await fetch(base+'/api.php?action=command')).status,405);
});
test('Errori demo e DeepSeek non configurato sono espliciti',async()=>{
  assert.equal((await command(empty,'Fai qualunque cosa')).status,422);
  assert.equal((await command(empty,'Crea un cubo','deepseek')).status,502);
});
