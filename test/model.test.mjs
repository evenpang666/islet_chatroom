import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshBackend,parseJson } from '../lib/model.mjs';
function host(){const events=[],restrictions=[],created=[],cancelled=[],prompts=[];const agent={ctx:{get:()=>({restrict:value=>restrictions.push(value)})},session:{snapshotEvents:()=>events},whenIdle:async()=>{}};
  const ctx={sessions:{flush:async()=>{}},sessionController:{inspect:async()=>({meta:{cwd:'root'}}),create:async input=>{created.push(input);return{sessionId:'session-a'};},rename:async()=>{},resolveAgent:async()=>({agent}),cancel:({sessionId})=>cancelled.push(sessionId),prompt:async input=>{prompts.push(input);events.push({seq:events.length,type:'assistant/message',data:{message:{content:[{type:'text',text:'{"reply":true,"text":"你好","memory":[]}'}]}}},{seq:events.length+1,type:'turn/end',data:{reason:{kind:'completed'}}});}}};return{ctx,events,restrictions,created,cancelled,prompts,agent};}
test('uses DSH role preset, removes tools and reuses a persistent role session',async()=>{const f=host(),backend=createDshBackend(f.ctx,{root:'root'});let id;const first=await backend.run({title:'角色',prompt:'hi',onSession:async v=>id=v});assert.equal(first.text,'你好');assert.equal(id,'session-a');assert.equal(f.created[0].agentPreset,'chatroom-character');assert.deepEqual(f.restrictions,[{allow:[]}]);await backend.run({sessionId:id,title:'角色',prompt:'again'});assert.equal(f.created.length,1);assert.equal(f.prompts.length,2);backend.dispose();});
test('blocked DSH turns do not publish stale answers',async()=>{const f=host();f.ctx.sessionController.prompt=async()=>{f.events.push({seq:1,type:'turn/end',data:{reason:{kind:'blocked'}}});};await assert.rejects(createDshBackend(f.ctx,{root:'root'}).run({title:'角色',prompt:'hi'}),/未完成/);});
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
