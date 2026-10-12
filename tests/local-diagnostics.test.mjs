import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDiagnosticsServer} from '../scripts/diagnostics-server.mjs';
import {localDiagnostics} from '../public/js/local-diagnostics.js';
import {Diagnostics} from '../public/js/diagnostics.js';

test('Il raccoglitore locale salva fallimenti oscurati fuori da public e li conserva dopo un riavvio della pagina',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'deepcad-log-')),server=createDiagnosticsServer(directory);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`,headers={Origin:'http://localhost','Content-Type':'application/json'};
  const snapshot={app:'DeepCAD',version:1,entries:[{time:new Date().toISOString(),stage:'failed',data:{message:'invalid profile',key:'private-key',content:'sk-0123456789abcdef0123456789abcdef'}}]};
  const response=await fetch(base+'/diagnostics',{method:'POST',headers,body:JSON.stringify(snapshot)});assert.equal(response.status,204);
  const saved=await readFile(join(directory,'last-failure.json'),'utf8');assert.match(saved,/invalid profile/);assert.doesNotMatch(saved,/private-key|0123456789abcdef/);
  await fetch(base+'/diagnostics',{method:'POST',headers,body:JSON.stringify({...snapshot,entries:[{...snapshot.entries[0],stage:'startup',data:{}}]})});
  assert.equal(await readFile(join(directory,'last-failure.json'),'utf8'),saved);
  assert.equal((await fetch(base+'/diagnostics',{method:'POST',headers:{...headers,Origin:'https://vroby65.github.io'},body:JSON.stringify(snapshot)})).status,403);
  assert.equal((await fetch(base+'/../private.json',{headers})).status,404);
  assert.equal((await fetch(base+'/diagnostics',{headers})).status,405);
  assert.equal((await fetch(base+'/diagnostics',{method:'POST',headers,body:'{}'})).status,400);
  assert.equal((await fetch(base+'/diagnostics',{method:'POST',headers,body:'x'.repeat(800000)})).status,413);
  await fetch(base+'/diagnostics',{method:'POST',headers,body:JSON.stringify({...snapshot,entries:[]})});
  await assert.rejects(()=>readFile(join(directory,'last-failure.json')),/ENOENT/);
});

test('Il browser invia solo log già oscurati su localhost; Pages e raccoglitore assente non interferiscono con il CAD',async()=>{
  const log=new Diagnostics(()=> 'fake-key');log.record('failed',{message:'fake-key rejected'});
  const requests=[],fetcher=async(url,options)=>{requests.push({url,...options});return new Response(null,{status:204});};
  const remote=localDiagnostics(log,{hostname:'vroby65.github.io'},fetcher);await remote();assert.equal(requests.length,0);
  const send=localDiagnostics(log,{hostname:'localhost'},fetcher);await send();
  assert.equal(requests.length,1);assert.equal(requests[0].url,'http://127.0.0.1:8001/diagnostics');assert.doesNotMatch(requests[0].body,/fake-key/);
  await localDiagnostics(log,{hostname:'localhost'},async()=>{throw new TypeError('offline');})();
});
