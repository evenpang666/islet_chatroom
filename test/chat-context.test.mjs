import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChatPrompt,chatBudgets,recentWithinBudget,memoryWithinBudget} from '../lib/chat-context.mjs';
import {createDshBackend,roleSystemPrompt} from '../lib/model.mjs';
import {estimateTokens} from '../lib/usage.mjs';

const message=(id,text=id)=>({id,kind:'user',name:'朋友',text,at:'2026-10-19T04:00:00.000Z'});
const context=(overrides={})=>({owner:'room:role',instructions:'Shared Skill\nPRIVATE_ROLE_SKILL',language:'zh',topic:'聊天',memory:['PRIVATE_MEMORY'],members:[{id:'a',name:'朋友'}],
  messages:[message('first')],membershipUpdates:[],localTime:'中午十二点',timezone:'Asia/Shanghai',utc:'2026-10-19T04:00:00Z',fresh:true,...overrides});

function host({reply=()=>({reply:false,text:'',memory:[],busyMinutes:0}),usage}={}) {
  const agents=new Map(),prompts=[],requests=[];let created=0;
  const ctx={sessions:{flush:async()=>{}},sessionController:{
    inspect:async()=>({meta:{cwd:'root'}}),rename:async()=>{},cancel:async()=>{},
    create:async()=>{
      const sessionId='session-'+(++created),events=[],hooks=new Map();let section;
      const agent={events,ctx:{get:name=>name==='tools'?{restrict(){}}:{section:value=>{section=value;return()=>{section=undefined;};},suppressRuntimeContext:()=>()=>{}},
        on:(name,fn)=>{hooks.set(name,fn);return()=>hooks.delete(name);}},session:{snapshotEvents:()=>events},whenIdle:async()=>{},hooks,get section(){return section;}};
      agents.set(sessionId,agent);return{sessionId};
    },
    resolveAgent:async id=>({agent:agents.get(id)}),
    prompt:async input=>{
      const agent=agents.get(input.sessionId),text=input.content[0].text;prompts.push(input);
      const request=await agent.hooks.get('agent/request')({},async()=>({maxTokens:256000,provider:'fixture',model:'fixture'}));requests.push(request);
      agent.events.push({seq:agent.events.length,type:'user/message',data:{content:input.content}});
      const result=reply({input,number:prompts.length}),output=typeof result==='string'?result:JSON.stringify(result);
      const history=agent.events.filter(e=>e.type==='user/message'||e.type==='assistant/message').map(e=>(e.data.message?.content||e.data.content||[]).map(b=>b.text||'').join('\n')).join('\n');
      const sample=usage?.({input,number:prompts.length})||{inputTokens:estimateTokens(agent.section.text+'\n'+history),outputTokens:estimateTokens(output)};
      agent.events.push({seq:agent.events.length,type:'assistant/message',data:{usage:sample,message:{content:[{type:'text',text:output}]}}});
      agent.events.push({seq:agent.events.length,type:'turn/end',data:{reason:{kind:'completed'}}});
    }
  }};
  return{ctx,agents,prompts,requests,get created(){return created;}};
}
function runner(f,options={}){
  const backend=createDshBackend(f.ctx,{root:'root',...options}),ids=new Map(),usage=[];
  return{backend,usage,run:chatContext=>backend.run({sessionId:ids.get(chatContext.owner),title:chatContext.owner,responseType:'chat',chatContext,
    onSession:async id=>ids.set(chatContext.owner,id),onUsage:async u=>usage.push(u)}),ids};
}

test('unchanged skills, delivered messages and memories are not appended again; changes are explicit',async()=>{
  const f=host(),r=runner(f),first=context();await r.run(first);
  await r.run(context({memory:['PRIVATE_MEMORY','新约定'],messages:[message('first'),message('second','新消息')]}));
  const delta=f.prompts[1].content[0].text;
  assert.doesNotMatch(delta,/PRIVATE_ROLE_SKILL|PRIVATE_MEMORY|"first"|当前成员名单/);
  assert.match(delta,/新消息/);assert.match(delta,/新约定/);
  await r.run(context({memory:['新约定'],members:[{id:'b',name:'新朋友'}],messages:[message('second'),message('third')]}));
  const next=f.prompts[2].content[0].text;assert.match(next,/"removed":\["PRIVATE_MEMORY"\]/);assert.match(next,/新朋友/);assert.doesNotMatch(next,/"second"/);
  assert.equal(f.created,1);assert.ok(f.requests.every(c=>c.maxTokens===chatBudgets.output));
});

test('recent chat and memory budgets keep source data intact and mark an oversized newest message',()=>{
  const source=context({memory:Array.from({length:80},(_,i)=>String(i)+'记'.repeat(230)),messages:Array.from({length:50},(_,i)=>message('m'+i,'中'.repeat(2990)+'最终问题👩🏽‍🚀'))});
  const before=structuredClone(source),built=buildChatPrompt(source);
  assert.deepEqual(source,before);assert.ok(estimateTokens(JSON.stringify(built.snapshot.memory))<=chatBudgets.memory);
  assert.ok(built.snapshot.memory.length<80);assert.match(built.prompt,/仅提供末尾片段/);assert.match(built.prompt,/最终问题👩🏽‍🚀/);
  const selected=recentWithinBudget(source.messages,chatBudgets.messages,{excerpt:true});assert.ok(estimateTokens(JSON.stringify(selected))<=chatBudgets.messages);
  assert.equal(selected.at(-1).id,'m49');assert.ok(selected.length<50);
});

test('older relevant memories can be recalled within the budget without extra model calls',()=>{
  const important='用户约定周五去天文馆看土星。',memories=[important,...Array.from({length:79},(_,i)=>i+'日常笔记。'.repeat(35))];
  const selected=memoryWithinBudget(memories,[message('question','周五去天文馆的约定还记得吗？')]);
  assert.ok(selected.includes(important));assert.ok(selected.includes(memories.at(-1)));assert.ok(estimateTokens(JSON.stringify(selected))<=chatBudgets.memory);assert.equal(memories.length,80);
});

test('request guard counts format repairs and bootstraps with memory when the request limit is reached',async()=>{
  const f=host({reply:({number})=>number===1?'invalid':{reply:false,text:'',memory:[],busyMinutes:0}}),r=runner(f,{maxRequests:2});
  await r.run(context());assert.equal(f.prompts.length,2);assert.equal(f.created,1);
  await r.run(context());assert.equal(f.created,2);assert.equal(r.usage.length,3);assert.match(f.prompts[2].content[0].text,/PRIVATE_MEMORY|PRIVATE_ROLE_SKILL/);
});

test('repeated failures cannot keep accumulating in the same role session',async()=>{
  const f=host({reply:()=>'{invalid'}),r=runner(f);
  for(let i=0;i<30;i++)await assert.rejects(r.run(context()),/无效的 JSON/);
  assert.equal(f.prompts.length,60);assert.equal(f.created,30);assert.equal(r.usage.length,60);
  for(const agent of f.agents.values())assert.equal(agent.events.filter(e=>e.type==='user/message').length,2);
});

test('reported token pressure rotates before sending another delta',async()=>{
  const f=host({usage:()=>({inputTokens:30000,outputTokens:3000})}),r=runner(f);
  await r.run(context());await r.run(context({messages:[message('first'),message('second')]}));
  assert.equal(f.created,2);assert.match(f.prompts[1].content[0].text,/PRIVATE_ROLE_SKILL/);
});

test('format repair stops at the actual token budget and oversized raw output is never echoed for repair',async()=>{
  const f=host({reply:()=>'{invalid',usage:()=>({inputTokens:30000,outputTokens:3000})}),r=runner(f);
  await assert.rejects(r.run(context()),/无效的 JSON/);assert.equal(f.prompts.length,1);
  const g=host({reply:()=>'文'.repeat(8000)}),s=runner(g);
  await assert.rejects(s.run(context()),/无效的 JSON/);assert.equal(g.prompts.length,1);
});

test('restart, skill or language changes, missing cursor and Web edits each trigger a complete bootstrap',async()=>{
  const f=host(),r=runner(f);let c=context();await r.run(c);
  c={...c,instructions:c.instructions+'\n新的年代限制'};await r.run(c);assert.equal(f.created,2);
  c={...c,language:'en'};await r.run(c);assert.equal(f.created,3);assert.match(f.prompts.at(-1).content[0].text,/Conversation language: English/);
  c={...c,messages:[message('after-gap')]};await r.run(c);assert.equal(f.created,4);
  const agent=f.agents.get(r.ids.get(c.owner));agent.events.push({seq:agent.events.length,type:'user/message',data:{content:[{type:'text',text:'manual edit'}]}});
  await r.run(c);assert.equal(f.created,5);
  const restarted=createDshBackend(f.ctx,{root:'root'});
  await restarted.run({sessionId:r.ids.get(c.owner),responseType:'chat',chatContext:c});assert.equal(f.created,6);
  assert.match(f.prompts.at(-1).content[0].text,/PRIVATE_MEMORY/);
});

test('simultaneous roles retain separate skill, memory and message cursors',async()=>{
  const f=host(),r=runner(f),a=context({owner:'room:a',instructions:'ROLE_A',memory:['MEMORY_A']}),b=context({owner:'room:b',instructions:'ROLE_B',memory:['MEMORY_B']});
  await Promise.all([r.run(a),r.run(b)]);
  await Promise.all([r.run({...a,messages:[message('first'),message('a2')]}),r.run({...b,messages:[message('first'),message('b2')]})]);
  assert.equal(f.created,2);
  for(const [id,agent] of f.agents){const text=agent.events.filter(e=>e.type==='user/message').map(e=>e.data.content[0].text).join('\n');if(id===r.ids.get(a.owner)){assert.match(text,/ROLE_A/);assert.doesNotMatch(text,/ROLE_B|MEMORY_B|b2/);}else{assert.match(text,/ROLE_B/);assert.doesNotMatch(text,/ROLE_A|MEMORY_A|a2/);}}
});

test('an accidentally reused session ID cannot transfer private memories between owners',async()=>{
  const f=host(),r=runner(f),a=context({owner:'a'});await r.run(a);
  await r.backend.run({sessionId:r.ids.get('a'),title:'b',responseType:'chat',chatContext:context({owner:'b',memory:['OTHER_PRIVATE_MEMORY']})});
  assert.equal(f.created,2);const text=f.prompts[1].content[0].text;assert.match(text,/OTHER_PRIVATE_MEMORY/);assert.doesNotMatch(text,/"PRIVATE_MEMORY"/);
});

test('full long skills are preserved while unchanged followups remain incremental',async()=>{
  const f=host(),r=runner(f),c=context({instructions:'完整设定'.repeat(8000)+'必须保留的结尾边界'});
  await r.run(c);await r.run(c);assert.match(f.prompts[0].content[0].text,/必须保留的结尾边界/);assert.doesNotMatch(f.prompts[1].content[0].text,/完整设定/);assert.equal(f.created,1);
});

test('24-turn replay reduces cumulative input versus repeatedly appending full snapshots',async t=>{
  const f=host(),r=runner(f);let oldHistory=roleSystemPrompt('chat'),oldInput=0;const messages=[];
  for(let i=0;i<24;i++){
    messages.push(message('m'+i,'今天读书、散步和做饭，有些小事想和大家聊聊。'.repeat(5)));
    const c=context({instructions:'角色背景与独立设定。'.repeat(350),messages:[...messages]});
    oldHistory+='\n'+buildChatPrompt(c).prompt;oldInput+=estimateTokens(oldHistory);oldHistory+='\n'+JSON.stringify({reply:false,text:'',memory:[],busyMinutes:0});
    await r.run(c);
  }
  const optimized=r.usage.reduce((n,u)=>n+u.inputTokens+u.cacheReadTokens+u.cacheWriteTokens,0);
  assert.ok(optimized<oldInput*.35,`${optimized} vs ${oldInput}`);
  t.diagnostic(`Simulated input tokens: ${oldInput} -> ${optimized}; reduction ${(100*(1-optimized/oldInput)).toFixed(1)}%. No live model calls or price assumptions.`);
});
