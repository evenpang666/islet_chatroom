import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createRoomManager } from './rooms.mjs';
import { presets } from './presets.mjs';
import { selectLan,allowedClient,allowedHost } from './network.mjs';
import manifest from '../package.json' with {type:'json'};

const root=fileURLToPath(new URL('../',import.meta.url));
const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/avatar.js',['avatar.js','text/javascript; charset=utf-8']],['/locations.js',['locations.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/favicon.svg',['favicon.svg','image/svg+xml']]]);
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
for(const file of ['lobby.js','emoji.js','text.js','appearance.js','appearance-editor.js'])assets.set('/'+file,[file,'text/javascript; charset=utf-8']);
async function body(req) {
  let chunks=[],size=0;
  for await(const chunk of req){size+=chunk.length;if(size>400000){const e=Error('请求内容过大。');e.status=413;throw e;}chunks.push(chunk);}
  try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;}catch{throw Error('请求必须为 JSON 对象。');}
}
export async function createApp({dataDir=join(root,'.local'),backend=null,basePath='/chatroom',instanceId='preview',lan=selectLan(),runtime='preview',autoTick=true,roomOptions={}}={}) {
  const clients=new Map();
  let manager,extracting=false,mutation=Promise.resolve();
  const server=http.createServer((req,res)=>handler(req,res));
  const network=()=>({lanUrl:lan?`http://${lan.address}:${server.address()?.port}/`:null,adapter:lan?.name,port:server.address()?.port});
  const lobby=()=>({rooms:manager.list(),connected:!!backend?.connected,network:network()});
  const snapshot=id=>({...manager.get(id).room.snapshot(),network:network()});
  const send=(res,type,value)=>{
    if(res.writableLength>1000000){res.destroy();clients.delete(res);return;}
    res.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
  };
  const broadcast=(type,id)=>{
    if(!manager)return;
    let current,listing;
    for(const [res,selected] of clients){
      if(selected===id){
        if(type==='dissolved'){send(res,'dissolved',{id});res.end();clients.delete(res);}
        else if(type!=='rooms')send(res,type,current??=snapshot(id));
      }else if(!selected&&type!=='typing')send(res,'rooms',listing??=lobby());
    }
  };
  manager=await createRoomManager({dataDir,backend,baseSkill:await readFile(join(root,'skills/SKILL.md'),'utf8'),autoTick,roomOptions,emit:broadcast});
  const stream=(req,res,id=null)=>{
    if(clients.size>=40)return json(res,429,{error:'连接数过多。'});
    const initial=id?snapshot(id):lobby();
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    clients.set(res,id);send(res,id?'state':'rooms',initial);req.on('close',()=>clients.delete(res));
  };
  async function handler(req,res) {
    try{
      if(!allowedClient(req.socket.remoteAddress,lan)||!allowedHost(req.headers.host||'',lan))return json(res,403,{error:'仅允许本机或同一局域网访问。'});
      if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'不允许跨站请求。'});
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
      let path=new URL(req.url,'http://localhost').pathname;
      if(path===basePath){res.writeHead(302,{Location:basePath+'/'});return res.end();}
      if(path.startsWith(basePath+'/'))path=path.slice(basePath.length);
      const match=path.match(/^\/api\/rooms\/([^/]+)\/(state|events|messages|pause|export|dissolve)$/);
      if(req.method==='GET'){
        if(path==='/api/health')return json(res,200,{app:'chatroom',version:manifest.version,runtime,instanceId});
        if(path==='/api/rooms')return json(res,200,lobby());
        if(path==='/api/presets')return json(res,200,presets);
        if(path==='/api/events')return stream(req,res);
        if(match){
          const [,id,action]=match;
          if(action==='state')return json(res,200,snapshot(id));
          if(action==='events')return stream(req,res,id);
          if(action==='export'){res.setHeader('Content-Disposition','attachment; filename="islet-chat.json"');return json(res,200,{...snapshot(id),exportedAt:new Date().toISOString()});}
        }
        if(assets.has(path)){const [file,type]=assets.get(path);const content=await readFile(join(root,'public',file));res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});return res.end(content);}
      }
      if(req.method==='POST'){
        const input=await body(req);
        if(path==='/api/extract'){
          if(extracting)return json(res,429,{error:'正在提炼角色，请稍候。'});
          extracting=true;try{return json(res,200,await manager.extract(input));}finally{extracting=false;}
        }
        let action;
        if(path==='/api/rooms')action=async()=>{const {room}=await manager.create(input);return snapshot(room.snapshot().id);};
        if(match){const [,id,operation]=match;
          if(operation==='messages')action=async()=>{await manager.get(id).room.message(input);return snapshot(id);};
          if(operation==='pause')action=async()=>{await manager.get(id).room.pause(input.paused);return snapshot(id);};
          if(operation==='dissolve')action=async()=>{await manager.dissolve(id);return lobby();};
        }
        if(action){const work=mutation.catch(()=>{}).then(action);mutation=work;return json(res,200,await work);}
      }
      return json(res,404,{error:'页面不存在。'});
    }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.message});else res.destroy();}
  }
  server.requestTimeout=180000;
  const heartbeat=setInterval(()=>{for(const res of clients.keys())res.write(': heartbeat\n\n');},20000);heartbeat.unref();
  return {server,handler,manager,lan,async close(){clearInterval(heartbeat);for(const res of clients.keys())res.end();clients.clear();await mutation.catch(()=>{});await manager.close();backend?.dispose?.();}};
}
