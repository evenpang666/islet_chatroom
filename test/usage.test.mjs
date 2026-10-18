import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyUsage,addUsage,measureUsage,readPrices,estimateTokens} from '../lib/usage.mjs';
import {usageText,usageDetail} from '../public/text.js';
import {createRoomManager} from '../lib/rooms.mjs';
const route={provider:'deepseek-official',model:'deepseek-flash'};
const event=(usage,source=route)=>({type:'assistant/message',data:{usage,message:{source,content:[{type:'text',text:'{"reply":false}'}]}}});
test('provider counters include cache buckets, and reasoning is not double counted',()=>{
  const u=measureUsage([event({inputTokens:100,outputTokens:30,cacheReadTokens:50,cacheWriteTokens:20,totalTokens:200,reasoningTokens:15})]);
  assert.equal(u.totalTokens,200);assert.equal(u.inputTokens,100);assert.equal(u.outputTokens,30);assert.equal(u.estimatedCalls,0);assert.equal(u.calls,1);
  assert.ok(Math.abs(u.costs.USD-(100*.3+30*1.2+50*.006+20*.3)/1e6)<1e-12);
});
test('packed DSH stream usage, failed attempts and multiple calls are accumulated',()=>{
  const u=measureUsage([{type:'assistant/attempt',data:{stream:[{type:'chunk',chunk:{type:'usage',usage:{inputTokens:40,outputTokens:10,totalTokens:50}}}]}},event({inputTokens:80,outputTokens:20,totalTokens:100})],{fallbackRoute:route});
  assert.equal(u.calls,2);assert.equal(u.totalTokens,150);assert.equal(u.estimatedCalls,0);assert.equal(u.unpricedCalls,0);
});
test('missing or contradictory usage is explicitly estimated; rejected submissions do not fabricate usage',()=>{
  const u=measureUsage([event({inputTokens:100,outputTokens:10,totalTokens:9})],{inputText:'你好，世界！ hello'});
  assert.equal(u.estimatedCalls,1);assert.ok(u.totalTokens>0);assert.equal(estimateTokens('你好'),3);assert.equal(estimateTokens('abcd'),1);
  assert.equal(measureUsage([],{accepted:false,inputText:'not submitted'}).calls,0);
  assert.equal(measureUsage([],{accepted:true,inputText:'submitted'}).estimatedCalls,1);
});
test('exact route pricing, unknown routes, zero prices and currencies are handled without a fake free total',()=>{
  const prices=readPrices(JSON.stringify({'custom/model':{input:5,output:10,currency:'CNY'}}));
  const total=emptyUsage();addUsage(total,measureUsage([event({inputTokens:100,outputTokens:10},{provider:'custom',model:'model'})],{prices}));
  addUsage(total,measureUsage([event({inputTokens:100,outputTokens:10})]));
  addUsage(total,measureUsage([event({inputTokens:100,outputTokens:10},{provider:'unknown',model:'model'})]));
  assert.equal(total.totalTokens,330);assert.equal(total.calls,3);assert.equal(total.unpricedCalls,1);assert.ok(total.costs.USD>0&&total.costs.CNY>0);assert.match(usageText(total),/部分未计价/);
  const unknown=measureUsage([event({inputTokens:1,outputTokens:1},{provider:'custom',model:'missing'})]);assert.match(usageText(unknown),/待配置单价/);
  assert.throws(()=>readPrices('{bad'),/JSON/);assert.throws(()=>readPrices('{"a/b":{"input":-1,"output":2,"currency":"USD"}}'),/无效/);
  const free=measureUsage([event({inputTokens:1,outputTokens:1},{provider:'free',model:'model'})],{prices:readPrices('{"free/model":{"input":0,"output":0,"currency":"USD"}}')});assert.equal(free.unpricedCalls,0);assert.equal(free.costs.USD,0);
});
test('room accounting survives silent replies, errors, leaving and reopening, and never crosses rooms',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'islet-usage-'));const usage=measureUsage([event({inputTokens:200,outputTokens:50,totalTokens:250})]);
  const config={dataDir,baseSkill:'shared',autoTick:false,backend:{connected:true,run:async r=>{await r.onUsage(usage);if(r.title.includes('失败'))throw Error('bad JSON');return{reply:false,usage:{totalTokens:999999}};}},roomOptions:{now:()=>Date.parse('2026-10-18T08:00:00Z'),random:()=>0}};
  const m=await createRoomManager(config);t.after(()=>m.close());
  const role={name:'朋友',background:'测试人物',sleepStart:0,sleepEnd:0,replySeconds:1,initiative:1,busyProbability:0};
  const a=await m.create({name:'正常',agents:[role]}),b=await m.create({name:'失败',agents:[role]});
  await a.room.message({text:'测试'});a.store.state.agents[0].runtime.nextAt=0;await a.room.tick();
  assert.equal(a.room.snapshot().usage.totalTokens,250);assert.equal(a.room.snapshot().messages.length,1);assert.equal(b.room.snapshot().usage.totalTokens,0);
  await b.room.message({text:'测试'});b.store.state.agents[0].runtime.nextAt=0;await b.room.tick();assert.equal(b.room.snapshot().usage.totalTokens,250);assert.match(b.room.snapshot().error,/bad JSON/);
  const id=a.room.snapshot().id;await a.room.pause(true);await m.close();
  const reopened=await createRoomManager(config);t.after(()=>reopened.close());assert.equal(reopened.get(id).room.snapshot().usage.totalTokens,250);assert.equal(reopened.get(id).room.snapshot().usage.calls,1);
  await reopened.dissolve(id);const archive=JSON.parse(await readFile(join(dataDir,'rooms',id,'room.json'),'utf8'));assert.equal(archive.usage.totalTokens,250);assert.ok(archive.dissolvedAt);
});
test('footer makes old history and unavailable measurements explicit',()=>{
  assert.match(usageText(undefined),/暂无统计/);const u=emptyUsage({partialHistory:true});assert.match(usageText(u),/自更新后统计/);assert.match(usageDetail(u),/历史用量不可追溯/);assert.ok(!usageText(emptyUsage()).includes('暂无统计'));
});
