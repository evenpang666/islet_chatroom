import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshBackend,parseJson } from '../lib/model.mjs';
function host(){const events=[],restrictions=[],created=[],cancelled=[],prompts=[],systems=[];let activeSection,contextSuppressed=false;
  const systemPrompt={section:value=>{assert.equal(activeSection,undefined);activeSection=value;return async()=>{await new Promise(setImmediate);activeSection=undefined;};},suppressRuntimeContext:()=>{contextSuppressed=true;return async()=>{await new Promise(setImmediate);contextSuppressed=false;};}};
  const agent={ctx:{on:()=>()=>{},get:name=>name==='systemPrompt'?systemPrompt:{restrict:value=>restrictions.push(value)}},session:{snapshotEvents:()=>events},whenIdle:async()=>{}};
  const ctx={sessions:{flush:async()=>{}},sessionController:{inspect:async()=>({meta:{cwd:'root'}}),create:async input=>{created.push(input);return{sessionId:'session-a'};},rename:async()=>{},resolveAgent:async()=>({agent}),cancel:({sessionId})=>cancelled.push(sessionId),prompt:async input=>{prompts.push(input);systems.push({section:activeSection,contextSuppressed});events.push({seq:events.length,type:'assistant/message',data:{message:{content:[{type:'text',text:'{"reply":true,"text":"你好","memory":[],"busyMinutes":0}'}]}}},{seq:events.length+1,type:'turn/end',data:{reason:{kind:'completed'}}});}}};return{ctx,events,restrictions,created,cancelled,prompts,systems,systemPrompt,agent,get activeSection(){return activeSection;},get contextSuppressed(){return contextSuppressed;}};}
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
  assert.ok(f.prompts[1].content[0].text.endsWith(JSON.stringify('你好 😊')));assert.match(f.prompts[1].content[0].text,/不从历史补写/);
});

test('resumed chat sessions receive the complete JSON contract before every first answer',async()=>{
  const f=host(),original=f.ctx.sessionController.prompt,backend=createDshBackend(f.ctx,{root:'root'});
  f.events.push({seq:0,type:'assistant/message',data:{message:{content:[{type:'text',text:'old plain dialogue'}]}}});
  f.ctx.sessionController.prompt=async input=>{
    await original(input);
    const {section,contextSuppressed}=f.systems.at(-1);
    assert.equal(section.name,'deployment:persona-prefix');assert.equal(section.complete,true);assert.equal(section.interpolate,false);assert.equal(contextSuppressed,true);
    assert.match(section.text,/reply、text、memory、busyMinutes/);assert.match(section.text,/即使历史回复是普通文字/);
    const examples=section.text.match(/\{"reply":[^\n]+\}/g).map(JSON.parse);
    assert.deepEqual(examples.map(e=>e.reply),[true,false]);assert.equal(examples[1].text,'');
  };
  for(let i=0;i<3;i++){
    const result=await backend.run({sessionId:'session-a',title:'角色',prompt:'chat with a long history',responseType:'chat'});
    assert.equal(result.text,'你好');assert.equal(f.activeSection,undefined);assert.equal(f.contextSuppressed,false);
  }
  assert.equal(f.created.length,0);assert.equal(f.prompts.length,3);assert.deepEqual(f.restrictions,[{allow:[]}]);
});

test('chat schema preserves intentional silence, memory, text and busy duration in one request',async()=>{
  for(const expected of [{reply:false,text:'',memory:['原有约定'],busyMinutes:15},{reply:true,text:'“好呀”\n一起走 😊',memory:[],busyMinutes:0}]){
    const f=host(),original=f.ctx.sessionController.prompt;
    f.ctx.sessionController.prompt=async input=>{await original(input);f.events.at(-2).data.message.content[0].text=JSON.stringify(expected);};
    assert.deepEqual(await createDshBackend(f.ctx,{root:'root'}).run({prompt:'chat',responseType:'chat'}),expected);assert.equal(f.prompts.length,1);
  }
});

test('chat schema rejects incorrect field types without inventing dialogue or state',async()=>{
  const valid={reply:true,text:'hello',memory:[],busyMinutes:0};
  for(const invalid of [{...valid,reply:'true'},{...valid,reply:false},{...valid,text:''},{...valid,memory:'remember'},{...valid,memory:[1]},{...valid,memory:['1','2','3','4']},{...valid,busyMinutes:'15'},{...valid,busyMinutes:181},{reply:false}]){
    const f=host(),original=f.ctx.sessionController.prompt;
    f.ctx.sessionController.prompt=async input=>{await original(input);f.events.at(-2).data.message.content[0].text=JSON.stringify(invalid);};
    await assert.rejects(createDshBackend(f.ctx,{root:'root'}).run({prompt:'chat',responseType:'chat'}),/格式不完整/);
    assert.equal(f.prompts.length,2);assert.equal(f.activeSection,undefined);assert.equal(f.contextSuppressed,false);
  }
});

test('non-chat extraction keeps its own object schema and releases the chat contract',async()=>{
  const f=host(),backend=createDshBackend(f.ctx,{root:'root'}),original=f.ctx.sessionController.prompt;
  await backend.run({sessionId:'session-a',prompt:'chat',responseType:'chat'});
  const expected={name:'小林',background:'学生',personality:'温和',style:'短句',habits:'读书'};
  f.ctx.sessionController.prompt=async input=>{await original(input);f.events.at(-2).data.message.content[0].text=JSON.stringify(expected);};
  assert.deepEqual(await backend.run({sessionId:'session-a',prompt:'extract character'}),expected);
  assert.doesNotMatch(f.systems.at(-1).section.text,/busyMinutes/);assert.equal(f.activeSection,undefined);assert.equal(f.prompts.length,2);
});
test('invalid chat schema is repaired at most once, then fails visibly',async()=>{
  const f=host(),original=f.ctx.sessionController.prompt;let calls=0;
  f.ctx.sessionController.prompt=async input=>{calls++;await original(input);f.events.at(-2).data.message.content[0].text='{"text":"missing reply"}';};
  await assert.rejects(createDshBackend(f.ctx,{root:'root'}).run({title:'角色',prompt:'hi',responseType:'chat'}),/格式不完整/);assert.equal(calls,2);
});

test('all real usage is reported before returning, including JSON repair and intentional silence',async()=>{
  const f=host(),original=f.ctx.sessionController.prompt,deltas=[];let calls=0;
  f.ctx.sessionController.prompt=async input=>{await original(input);const data=f.events.at(-2).data;data.usage={inputTokens:100,outputTokens:20,cacheReadTokens:30,totalTokens:150};data.message.source={provider:'deepseek-official',model:'deepseek-flash'};data.message.content[0].text=++calls===1?'not JSON':'{"reply":false,"text":"","memory":[],"busyMinutes":0}';};
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
