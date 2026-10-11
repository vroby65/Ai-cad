import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
export function createStaticServer() {
  return createServer(async(req,res)=>{
    try {
      if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
      let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(path.split('/').some(part=>part.startsWith('.'))) throw new Error('Private path');
      if(path.endsWith('/')) path+='index.html';
      const target=resolve(root,'.'+path);
      if(!target.startsWith(root.endsWith(sep)?root:root+sep) || !mime[extname(target)]) throw new Error('Private path');
      const data=await readFile(target);
      res.writeHead(200,{'Content-Type':mime[extname(target)],'Content-Length':data.byteLength,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:data);
    } catch {res.writeHead(404);res.end('Not found');}
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createStaticServer();
  server.on('error',error=>{console.error('Impossibile avviare il server locale:',error.message);process.exit(1);});
  server.listen(8000,'127.0.0.1',()=>console.log('DeepCAD: http://127.0.0.1:8000'));
}
