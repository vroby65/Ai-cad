import {createServer} from 'node:http';
import {mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Diagnostics} from '../public/js/diagnostics.js';

export function createDiagnosticsServer(directory) {
  let writes=Promise.resolve();
  return createServer(async(req,res)=>{
    const origin=req.headers.origin||'';
    if(!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(origin)) {res.writeHead(403);res.end();return;}
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    if(req.url!=='/diagnostics') {res.writeHead(404);res.end();return;}
    if(req.method==='OPTIONS') {res.writeHead(204,{'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'content-type'});res.end();return;}
    if(req.method!=='POST') {res.writeHead(405);res.end();return;}
    if(Number(req.headers['content-length'])>768*1024) {res.writeHead(413);res.end();req.resume();return;}
    try {
      let bytes=0;const chunks=[];
      for await(const chunk of req) {
        bytes+=chunk.length;if(bytes>768*1024) throw Object.assign(new Error(),{status:413});chunks.push(chunk);
      }
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(data.app!=='AIcad'||data.version!==1||!Array.isArray(data.entries)||data.entries.length>100) throw new Error();
      const log=new Diagnostics();
      for(const entry of data.entries) {
        if(typeof entry.stage!=='string'||entry.stage.length>64||typeof entry.time!=='string'||entry.time.length>40||!Number.isFinite(Date.parse(entry.time))||!entry.data||typeof entry.data!=='object'||Array.isArray(entry.data))throw new Error();
        log.record(entry.stage,entry.data);log.entries.at(-1).time=entry.time;
      }
      const raw=log.export(),failed=log.entries.some(e=>['failed','error','runtime-error','webgl-error'].includes(e.stage));
      writes=writes.catch(()=>{}).then(async()=>{
        await mkdir(directory,{recursive:true,mode:0o700});
        if(!log.entries.length) await rm(join(directory,'last-failure.json'),{force:true});
        for(const name of ['latest',...(failed?['last-failure']:[])]) {
          const target=join(directory,name+'.json');await writeFile(target+'.tmp',raw,{mode:0o600});await rename(target+'.tmp',target);
        }
      });
      await writes;res.writeHead(204);res.end();
    } catch(error) {res.writeHead(error.status||400);res.end();}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const directory=fileURLToPath(new URL('../.local/logs/',import.meta.url)),server=createDiagnosticsServer(directory);
  server.on('error',error=>{console.error('Raccolta log non disponibile:',error.code);process.exit(1);});
  server.listen(8001,'127.0.0.1',()=>console.log('AIcad: local log collection running on port 8001.'));
}
