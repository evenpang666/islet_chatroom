import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../lib/server.mjs';
import { listenIndependent } from '../lib/independent-http.mjs';
import { selectLan,allowedClient } from '../lib/network.mjs';
async function fixture(t){const app=await createApp({dataDir:await mkdtemp(join(tmpdir(),'islet-http-')),autoTick:false});const port=await listenIndependent(app.server,0,{host:'127.0.0.1'});t.after(async()=>{await app.close();await new Promise(r=>app.server.close(r));});return {app,port,url:`http://127.0.0.1:${port}`};}
test('independent HTTP and DSH prefix expose same app, with 50 presets',async t=>{
  const {url}=await fixture(t);assert.equal((await fetch(url+'/')).status,200);assert.equal((await fetch(url+'/chatroom/')).status,200);
  assert.equal((await(await fetch(url+'/api/presets')).json()).length,50);const health=await(await fetch(url+'/chatroom/api/health')).json();assert.equal(health.app,'chatroom');
  const script=await fetch(url+'/avatar.js');assert.match(script.headers.get('Content-Type'),/javascript/);assert.equal(health.version,'1.2.1');
  for(const file of ['appearance.js','appearance-editor.js','text.js']){const module=await fetch(url+'/chatroom/'+file);assert.equal(module.status,200);assert.match(module.headers.get('Content-Type'),/javascript/);}
});

test('HTTP room creation and export preserve every appearance channel and selected preset',async t=>{
  const {url}=await fixture(t);const seeds=await(await fetch(url+'/api/presets')).json();
  const {randomAppearance}=await import('../public/appearance.js');const look=randomAppearance(()=>.82);
  const request={name:'外观验证',agents:[{...seeds[0],presetId:'harry',avatar:look}]};
  const response=await fetch(url+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});assert.equal(response.status,200);
  const room=await response.json();assert.deepEqual(room.agents[0].avatar,look);assert.equal(room.agents[0].presetId,'harry');
  const exported=await(await fetch(url+`/api/rooms/${room.id}/export`)).json();assert.deepEqual(exported.agents[0].avatar,look);assert.equal(exported.agents[0].background,seeds[0].background);
});
test('cross-origin changes, host spoofing and malformed bodies are rejected',async t=>{
  const {url,port}=await fixture(t);assert.equal((await fetch(url+'/api/rooms',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403);
  assert.equal((await fetch(url+'/api/rooms',{method:'POST',body:'null'})).status,400);
  const status=await new Promise(r=>{http.get({hostname:'127.0.0.1',port,path:'/',headers:{Host:'evil.example:1234'}},res=>{res.resume();r(res.statusCode);});});assert.equal(status,403);
});
test('SSE broadcasts state and different clients share messages',async t=>{
  const {url}=await fixture(t);const post=async(p,data)=>await(await fetch(url+'/api/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
  const seeds=await(await fetch(url+'/api/presets')).json();const room=await post('rooms',{agents:[seeds[0]]});
  const signal=AbortSignal.timeout(3000),stream=await fetch(url+`/api/rooms/${room.id}/events`,{signal}),reader=stream.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: state/);
  const sent=await post(`rooms/${room.id}/messages`,{text:'你好，世界。 👩🏽‍💻❤️',name:'设备二',clientId:'phone'});assert.equal(sent.messages[0].text,'你好，世界。 👩🏽‍💻❤️');
  const event=new TextDecoder().decode((await reader.read()).value);assert.match(event,/设备二/);await reader.cancel();
});
test('Ethernet is preferred and virtual adapters are excluded',()=>{
  const address=a=>[{family:'IPv4',internal:false,address:a,netmask:'255.255.255.0'}];
  const lan=selectLan({'Wi-Fi':address('192.168.2.1'),'以太网':address('10.1.1.5'),'vEthernet':address('192.168.1.1')});assert.equal(lan.name,'以太网');
  assert.ok(allowedClient('::ffff:10.1.1.8',lan));assert.equal(allowedClient('10.1.2.8',lan),false);
});
test('occupied independent port falls back to a real listener',async t=>{const first=http.createServer();const port=await listenIndependent(first,0,{host:'127.0.0.1'});const second=http.createServer();t.after(()=>{first.close();second.close();});const next=await listenIndependent(second,port,{host:'127.0.0.1',log:()=>{}});assert.notEqual(port,next);assert.ok(second.listening);});

test('room-scoped streams never receive another room conversation',async t=>{
  const {url}=await fixture(t);const post=async(path,data)=>await(await fetch(url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
  const seeds=await(await fetch(url+'/api/presets')).json();const a=await post('rooms',{name:'甲',agents:[seeds[0]]}),b=await post('rooms',{name:'乙',agents:[seeds[1]]});
  const stream=await fetch(url+`/api/rooms/${a.id}/events`,{signal:AbortSignal.timeout(3000)}),reader=stream.body.getReader();await reader.read();
  let delivered=false;const pending=reader.read().then(v=>{delivered=true;return v;});
  await post(`rooms/${b.id}/messages`,{text:'乙的私有消息'});await new Promise(r=>setTimeout(r,50));assert.equal(delivered,false);
  await post(`rooms/${a.id}/messages`,{text:'甲的群聊消息 😊'});const packet=new TextDecoder().decode((await pending).value);assert.match(packet,/甲的群聊消息/);assert.ok(!packet.includes('乙的私有消息'));await reader.cancel();
});
test('lobby lists multiple rooms and dissolution notifies connected users and revokes the room',async t=>{
  const {url}=await fixture(t);const post=async(path,data)=>await(await fetch(url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
  const seeds=await(await fetch(url+'/api/presets')).json();const a=await post('rooms',{name:'保留',agents:[seeds[0]]}),b=await post('rooms',{name:'解散',agents:[seeds[1]]});
  const lobbyStream=await fetch(url+'/api/events',{signal:AbortSignal.timeout(3000)}),lr=lobbyStream.body.getReader();assert.match(new TextDecoder().decode((await lr.read()).value),/event: rooms/);
  const stream=await fetch(url+`/api/rooms/${b.id}/events`,{signal:AbortSignal.timeout(3000)}),rr=stream.body.getReader();await rr.read();
  const listing=await post(`rooms/${b.id}/dissolve`,{});assert.deepEqual(listing.rooms.map(r=>r.id),[a.id]);
  assert.match(new TextDecoder().decode((await rr.read()).value),/event: dissolved/);assert.match(new TextDecoder().decode((await lr.read()).value),/"name":"保留"/);
  assert.equal((await fetch(url+`/api/rooms/${b.id}/state`)).status,404);assert.equal((await fetch(url+`/api/rooms/${b.id}/messages`,{method:'POST',body:'{"text":"old link"}'})).status,404);await lr.cancel();await rr.cancel();
});
