import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRoomManager} from '../lib/rooms.mjs';
import {presets} from '../lib/presets.mjs';
const seed=id=>({...presets.find(p=>p.id===id),presetId:id,sleepStart:0,sleepEnd:0,replySeconds:1,busyProbability:0});
async function fixture(t){
  const calls=[],dataDir=await mkdtemp(join(tmpdir(),'islet-members-'));let time=Date.parse('2026-10-18T04:00:00Z');
  const config={dataDir,autoTick:false,backend:{connected:true,run:async req=>{calls.push(req);return{reply:false,memory:[]};}},roomOptions:{now:()=>time,random:()=>.5}};
  const manager=await createRoomManager(config);t.after(()=>manager.close());return{manager,config,calls,time:n=>time=n};
}
test('new members join an existing room only after Skill preparation, obey occupancy and capacity, and preserve existing data',async t=>{
  const f=await fixture(t),record=await f.manager.create({agents:[seed('harry')]});const id=record.room.snapshot().id;
  record.store.state.agents[0].memory=['仅属于哈利'];await record.room.message({text:'欢迎新朋友'});
  await f.manager.addAgents(id,{agents:[seed('tony')]});const joined=record.room.snapshot();
  assert.equal(joined.agents.length,2);assert.equal(joined.messages[0].text,'欢迎新朋友');assert.deepEqual(joined.agents[0].memory,['仅属于哈利']);assert.deepEqual(joined.agents[1].memory,[]);
  assert.equal(joined.messages[1].event,'member-joined');assert.match(joined.messages[1].text,/托尼.*加入/);
  const a=record.store.state.agents[1];assert.match(await readFile(join(record.store.directory,'skills',a.id,'SKILL.md'),'utf8'),/生活年代/);
  await assert.rejects(f.manager.addAgents(id,{agents:[seed('tony')]}),e=>e.status===409);
  const elsewhere=await f.manager.create({agents:[seed('einstein')]});await assert.rejects(f.manager.addAgents(id,{agents:[seed('einstein')]}),e=>e.status===409);
  await f.manager.addAgents(id,{agents:[seed('ron'),seed('hermione'),seed('dumbledore')]});assert.equal(record.room.snapshot().agents.length,5);
  await assert.rejects(f.manager.addAgents(id,{agents:[seed('curie')]}),/最多 5/);assert.equal(record.room.snapshot().agents.length,5);
  await f.manager.dissolve(elsewhere.room.snapshot().id);
});
test('membership notices reach remaining and new roles even when normal chat context has scrolled beyond them',async t=>{
  const f=await fixture(t),record=await f.manager.create({agents:[seed('harry'),seed('ron')]});const id=record.room.snapshot().id,ron=record.store.state.agents[1];
  await f.manager.addAgents(id,{agents:[seed('tony')]});await f.manager.removeAgent(id,ron.id);
  for(let i=0;i<60;i++)await record.room.message({text:`中间聊天 ${i}`});
  for(const a of record.store.state.agents)a.runtime.nextAt=0;
  await record.room.tick();assert.equal(f.calls.length,2);
  for(const req of f.calls){assert.match(req.prompt,/member-joined/);assert.match(req.prompt,/member-removed/);assert.match(req.prompt,/罗恩.*已被移出/);assert.match(req.prompt,/当前成员名单/);}
  assert.equal(record.room.snapshot().messages.filter(m=>m.kind==='system').length,2);
});
test('adding while paused keeps the room paused, records notices, and releases an ejected role for reinvitation after restart',async t=>{
  const f=await fixture(t),record=await f.manager.create({agents:[seed('harry')]});const id=record.room.snapshot().id;
  await record.room.pause(true);await f.manager.addAgents(id,{agents:[seed('tony')]});assert.ok(record.room.snapshot().paused);
  const tony=record.store.state.agents[1];await f.manager.removeAgent(id,tony.id);await f.manager.close();
  const reopened=await createRoomManager(f.config);t.after(()=>reopened.close());await reopened.addAgents(id,{agents:[seed('tony')]});
  const state=reopened.get(id).room.snapshot();assert.ok(state.paused);assert.equal(state.messages.filter(m=>m.event==='member-joined').length,2);assert.equal(state.messages.filter(m=>m.event==='member-removed').length,1);
});
test('two simultaneous invitations into the last available seat never exceed five members',async t=>{
  const f=await fixture(t),record=await f.manager.create({agents:['harry','ron','hermione','dumbledore'].map(seed)}),id=record.room.snapshot().id;
  const result=await Promise.allSettled([f.manager.addAgents(id,{agents:[seed('tony')]}),f.manager.addAgents(id,{agents:[seed('einstein')]})]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(record.room.snapshot().agents.length,5);assert.equal(record.room.snapshot().messages.filter(m=>m.event==='member-joined').length,1);
});
