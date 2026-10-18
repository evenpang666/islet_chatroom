import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshBackend,parseJson } from '../lib/model.mjs';
function host(){const events=[],restrictions=[],created=[],cancelled=[],prompts=[];const agent={ctx:{get:()=>({restrict:value=>restrictions.push(value)})},session:{snapshotEvents:()=>events},whenIdle:async()=>{}};
  const ctx={sessions:{flush:async()=>{}},sessionController:{inspect:async()=>({meta:{cwd:'root'}}),create:async input=>{created.push(input);return{sessionId:'session-a'};},rename:async()=>{},resolveAgent:async()=>({agent}),cancel:({sessionId})=>cancelled.push(sessionId),prompt:async input=>{prompts.push(input);events.push({seq:events.length,type:'assistant/message',data:{message:{content:[{type:'text',text:'{"reply":true,"text":"你好","memory":[]}'}]}}},{seq:events.length+1,type:'turn/end',data:{reason:{kind:'completed'}}});}}};return{ctx,events,restrictions,created,cancelled,prompts,agent};}
test('uses DSH role preset, removes tools and reuses a persistent role session',async()=>{const f=host(),backend=createDshBackend(f.ctx,{root:'root'});let id;const first=await backend.run({title:'角色',prompt:'hi',onSession:async v=>id=v});assert.equal(first.text,'你好');assert.equal(id,'session-a');assert.equal(f.created[0].agentPreset,'chatroom-character');assert.deepEqual(f.restrictions,[{allow:[]}]);await backend.run({sessionId:id,title:'角色',prompt:'again'});assert.equal(f.created.length,1);assert.equal(f.prompts.length,2);backend.dispose();});
test('blocked DSH turns do not publish stale answers or fabricate billed requests',async()=>{const f=host(),usage=[];f.ctx.sessionController.prompt=async()=>{f.events.push({seq:1,type:'turn/end',data:{reason:{kind:'blocked'}}});};await assert.rejects(createDshBackend(f.ctx,{root:'root'}).run({title:'角色',prompt:'hi',onUsage:async u=>usage.push(u)}),/未完成/);assert.equal(usage.length,0);});
test('timeout cancels DSH rather than leaving generation running',async()=>{const f=host();f.agent.whenIdle=()=>new Promise(()=>{});await assert.rejects(createDshBackend(f.ctx,{root:'root',timeoutMs:30}).run({title:'角色',prompt:'hi'}),/取消或超时/);assert.deepEqual(f.cancelled,['session-a']);});
test('strict JSON extraction supports a single markdown fence',()=>{assert.deepEqual(parseJson('```json\n{"reply":false}\n```'),{reply:false});assert.throws(()=>parseJson('Here is an answer {}'));assert.throws(()=>parseJson('[]'));});
test('DSH receives each character own timezone rather than a shared room timezone',async()=>{const f=host();await createDshBackend(f.ctx,{root:'root'}).run({title:'角色',prompt:'hello',timezone:'America/New_York'});assert.equal(f.prompts[0].clientTimeZone,'America/New_York');});
test('malformed model output gets one bounded repair without publishing raw text',async()=>{
  const f=host(),original=f.ctx.sessionController.prompt;let calls=0;
  f.ctx.sessionController.prompt=async input=>{await original(input);if(++calls===1)f.events.at(-2).data.message.content[0].text='你好 😊';};
  const result=await createDshBackend(f.ctx,{root:'root'}).run({title:'角色',prompt:'hello',responseType:'chat'});
  assert.equal(calls,2);assert.equal(result.text,'你好');assert.match(f.prompts[1].content[0].text,/仅修复格式/);
});
test('invalid chat schema is repaired at most once, then fails visibly',async()=>{
  const f=host(),original=f.ctx.sessionController.prompt;let calls=0;
  f.ctx.sessionController.prompt=async input=>{calls++;await original(input);f.events.at(-2).data.message.content[0].text='{"text":"missing reply"}';};
  await assert.rejects(createDshBackend(f.ctx,{root:'root'}).run({title:'角色',prompt:'hi',responseType:'chat'}),/格式不完整/);assert.equal(calls,2);
});

test('all real usage is reported before returning, including JSON repair and intentional silence',async()=>{
  const f=host(),original=f.ctx.sessionController.prompt,deltas=[];let calls=0;
  f.ctx.sessionController.prompt=async input=>{await original(input);const data=f.events.at(-2).data;data.usage={inputTokens:100,outputTokens:20,cacheReadTokens:30,totalTokens:150};data.message.source={provider:'deepseek-official',model:'deepseek-flash'};data.message.content[0].text=++calls===1?'not JSON':'{"reply":false}';};
  const result=await createDshBackend(f.ctx,{root:'root'}).run({title:'角色',prompt:'hello',responseType:'chat',onUsage:async u=>deltas.push(u)});
  assert.equal(result.reply,false);assert.equal(deltas.length,2);assert.equal(deltas.reduce((n,u)=>n+u.totalTokens,0),300);assert.ok(deltas.every(u=>u.costs.USD>0));
});
test('failed JSON and canceled turns still disclose known token usage',async()=>{
  const f=host(),original=f.ctx.sessionController.prompt,deltas=[];
  f.ctx.sessionController.prompt=async input=>{await original(input);f.events.at(-2).data.usage={inputTokens:100,outputTokens:10,totalTokens:110};f.events.at(-2).data.message.content[0].text='invalid';};
  await assert.rejects(createDshBackend(f.ctx,{root:'root'}).run({title:'角色',prompt:'hello',onUsage:async u=>deltas.push(u)}));assert.equal(deltas.length,2);assert.equal(deltas[0].totalTokens,110);
  const g=host(),cancelUsage=[];g.agent.whenIdle=()=>new Promise(()=>{});
  await assert.rejects(createDshBackend(g.ctx,{root:'root',timeoutMs:20}).run({title:'角色',prompt:'hello',onUsage:async u=>cancelUsage.push(u)}),/取消或超时/);assert.equal(cancelUsage.length,1);
});
