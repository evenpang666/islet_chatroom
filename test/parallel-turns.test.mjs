import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createRoom} from '../lib/room.mjs';
import {createStore} from '../lib/store.mjs';
import {emptyUsage} from '../lib/usage.mjs';
async function until(check){for(let i=0;i<200;i++){if(check())return;await delay(5);}assert.fail('condition timed out');}
async function fixture(t,run,count=3){
  const store=await createStore(await mkdtemp(join(tmpdir(),'islet-parallel-')));let clock=Date.parse('2026-10-18T04:00:00Z');
  const room=createRoom({store,backend:{connected:true,run},autoTick:false,now:()=>clock,random:()=>.5,baseSkill:'共享约束'});
  t.after(()=>room.close());await room.configure({agents:Array.from({length:count},(_,i)=>({name:`角色${i}`,background:`独立人物${i}`,sleepStart:0,sleepEnd:0,replySeconds:1,typingCps:12,busyProbability:0,initiative:1}))});
  await room.start();clock+=60000;return{room,store,time:v=>clock=v};
}
test('five distinct characters generate concurrently and all type together; overlapping ticks never duplicate a role turn',async t=>{
  const gates=[],calls=[];const f=await fixture(t,req=>{calls.push(req);const gate=Promise.withResolvers();gates.push(gate);return gate.promise;},5);
  const work=f.room.tick();await until(()=>calls.length===5);await f.room.tick();assert.equal(calls.length,5);
  for(let i=0;i<5;i++){await calls[i].onSession(`own-session-${i}`);gates[i].resolve({reply:true,text:'嗯',memory:[`自己的记忆${i}`]});}
  await until(()=>f.room.snapshot().typing.length===5);assert.equal(f.room.snapshot().messages.length,0);await work;
  const messages=f.room.snapshot().messages;assert.equal(messages.length,5);assert.equal(new Set(messages.map(m=>m.agentId)).size,5);
  for(let i=0;i<5;i++){assert.equal(f.store.state.agents[i].sessionId,`own-session-${i}`);assert.deepEqual(f.store.state.agents[i].memory,[`自己的记忆${i}`]);}
});
test('removing one typing character cancels only its pending reply and preserves other replies and old history',async t=>{
  const f=await fixture(t,async()=>({reply:true,text:'嗯',memory:['本轮记忆']}));await f.room.message({text:'已有聊天'});
  for(const a of f.store.state.agents)a.runtime.nextAt=0;
  const work=f.room.tick();await until(()=>f.room.snapshot().typing.length===3);const removed=f.store.state.agents[1];
  await f.room.removeAgent(removed.id);assert.equal(f.room.snapshot().agents.length,2);assert.equal(f.room.snapshot().typing.length,2);
  await work;assert.equal(f.room.snapshot().messages.length,4);assert.equal(f.room.snapshot().messages.filter(m=>m.kind==='system'&&m.event==='member-removed').length,1);assert.ok(!f.room.snapshot().messages.some(m=>m.kind==='agent'&&m.agentId===removed.id));
  assert.equal(f.store.state.removedAgents[0].id,removed.id);assert.equal(f.room.snapshot().removedAgents,undefined);
});
test('pause and close cancel every parallel generation, with known usage retained',async t=>{
  let aborted=0;const f=await fixture(t,async req=>{
    const usage={...emptyUsage(),calls:1,totalTokens:7,inputTokens:5,outputTokens:2,costs:{},unpricedCalls:1};await req.onUsage(usage);
    return new Promise((resolve,reject)=>{const cancel=()=>{aborted++;reject(Error('aborted'));};req.signal.addEventListener('abort',cancel,{once:true});if(req.signal.aborted)cancel();});
  });
  const work=f.room.tick();await until(()=>f.room.snapshot().usage.calls===3);await f.room.pause(true);await work;
  assert.equal(aborted,3);assert.equal(f.room.snapshot().usage.totalTokens,21);assert.equal(f.room.snapshot().messages.length,0);
  await f.room.pause(false);const again=f.room.tick();await until(()=>f.room.snapshot().usage.calls===6);await f.room.close();await again;assert.equal(aborted,6);
});
test('one failed role does not block or hide the error when another role succeeds',async t=>{
  const f=await fixture(t,async req=>{if(req.title.endsWith('角色0'))throw Error('单角色故障');return{reply:false,memory:['仍然正常']};});
  await f.room.tick();assert.match(f.room.snapshot().error,/角色0.*单角色故障/);assert.deepEqual(f.store.state.agents[1].memory,['仍然正常']);
});
