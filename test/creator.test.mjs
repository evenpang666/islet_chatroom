import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCharacterLibrary,validateCreatedCharacter} from '../lib/creator.mjs';
import {createCharacterResearch,researchEvidence} from '../lib/research.mjs';
import {characterSections} from '../lib/character-skills.mjs';
import {createRoomManager} from '../lib/rooms.mjs';
import {createApp} from '../lib/server.mjs';
import {listenIndependent} from '../lib/independent-http.mjs';
import {normalizeAgent,characterSkill} from '../lib/room.mjs';
import {genderAppearance} from '../public/gender.js';
import {characterKey} from '../public/lobby.js';
import {setLanguage,h,t as tr} from '../public/i18n.js';
import {usageText} from '../public/text.js';
import {presets} from '../lib/presets.mjs';
import {englishProfiles,englishPreset,presetNames} from '../public/translations.js';

const urls=['https://example.org/biography','https://example.net/archive'];
export function characterResult(){return{name:'Research fixture',background:'A clearly labelled fictional fixture used to verify the creator workflow.',gender:'female',source:'Fixture archive',era:'1900–1950, selected stage 1930.',location:'London',timezone:'Europe/London',sections:Object.fromEntries(characterSections.map(key=>[key,((key==='每日行动'?'07:00 breakfast; 09:00 work; 12:00 lunch; 15:00 walk; 18:00 supper; 22:00 sleep. ':'')+key+' — This detailed fixture describes a specific character with habits, boundaries, motivations and original dialogue. ').repeat(2)])),sources:urls.map(url=>({title:'Fixture source',url}))};}
test('creator requires actual retrieved evidence and complete detailed schedules',()=>{
  assert.throws(()=>validateCreatedCharacter(characterResult(),[]),/实际检索来源/);
  const missing=characterResult();delete missing.sections['演绎边界'];assert.throws(()=>validateCreatedCharacter(missing,urls),/演绎边界/);
  const schedule=characterResult();schedule.sections['每日行动']='A detailed schedule without any concrete times. '.repeat(4);assert.throws(()=>validateCreatedCharacter(schedule,urls),/六个/);
  const result=characterResult();result.sources.push({url:'https://invented.example',title:'Invented'});const p=validateCreatedCharacter(result,urls);assert.equal(p.sources.length,2);assert.match(p.contract,/## 生活年代/);assert.equal(p.gender,'female');assert.equal(characterKey({presetId:p.id}),'preset:'+p.id);
});
test('extra preset Skill survives restart and reaches only its own role, with atomic occupancy',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'islet-library-')),research=async()=>({result:characterResult(),evidence:urls});
  let library=await createCharacterLibrary({dataDir,research});const preset=await library.generate({text:'Fixture public character',language:'en'});assert.equal(library.list().length,1);assert.equal('contract' in preset,false);
  const skill=await readFile(join(dataDir,'presets',preset.id,'SKILL.md'),'utf8');assert.match(skill,/## 每日行动/);
  library=await createCharacterLibrary({dataDir,research});let manager=await createRoomManager({dataDir,library,autoTick:false,baseSkill:'shared'});
  const {room}=await manager.create({name:'Library room',language:'en',agents:[{...preset,presetId:preset.id}]});const state=room.snapshot();assert.equal(state.agents[0].presetId,preset.id);assert.equal(state.language,'en');assert.equal('presetContract' in state.agents[0],false);
  assert.match(manager.get(state.id).store.state.agents[0].skill,/detailed fixture/);
  await assert.rejects(manager.create({agents:[{...preset,presetId:preset.id}]}),e=>e.status===409);await manager.close();
  manager=await createRoomManager({dataDir,library,autoTick:false,baseSkill:'shared'});assert.match(manager.get(state.id).store.state.agents[0].skill,/detailed fixture/);assert.equal(manager.get(state.id).room.snapshot().language,'en');await manager.close();
});
test('creator serializes expensive generation and does not save failed evidence',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'islet-creator-lock-'));let resolve;const research=()=>new Promise(r=>resolve=r);const library=await createCharacterLibrary({dataDir,research});const first=library.generate({text:'Fixture'});while(!resolve)await new Promise(r=>setTimeout(r,5));await assert.rejects(library.generate({text:'Other'}),e=>e.status===429);resolve({result:characterResult(),evidence:[]});await assert.rejects(first,/来源/);assert.equal(library.list().length,0);
});
const evidenceEvents=()=>[
 {type:'tool/call',data:{name:'web_search',callId:'search'}},{type:'tool/result',data:{message:{toolCallId:'search'},meta:{sources:urls.map(url=>({url}))}}},
 {type:'tool/call',data:{name:'web_fetch',callId:'fetch'}},{type:'tool/result',data:{message:{toolCallId:'fetch'},meta:{url:urls[0],statusCode:200}}}
];
test('research accepts only successful structured tool evidence, not model citations',()=>{
  assert.deepEqual(researchEvidence([{type:'assistant/message',data:{sources:urls}}]),[]);assert.deepEqual(researchEvidence(evidenceEvents()),urls);
  const bad=evidenceEvents();bad[3].data.message.isError=true;assert.deepEqual(researchEvidence(bad),[]);
});
test('DSH creator uses a separate web-only scoped agent, requested language, bounded tools and disposal',async()=>{
  const listeners=new Map(),restrictions=[],sections=[],registrations=[];let prompt,disposed=0;
  const agentCtx={tools:{restrict:v=>restrictions.push(v),presentAs(){}},systemPrompt:{suppressRuntimeContext(){},section:v=>sections.push(v)},on:(name,fn)=>listeners.set(name,fn)};
  const ctx={agentDefaultModel:{currentSelection:()=>({provider:'configured-provider',model:'configured-model'})},agents:{async create(options){assert.equal(options.agentOptions.provider,'configured-provider');assert.equal(options.agentOptions.model,'configured-model');await options.setup(agentCtx);return{dispose:async()=>disposed++,agent:{followup:v=>prompt=v,whenIdle:async()=>{},session:{snapshotEvents:()=>[...evidenceEvents(),{type:'assistant/message',data:{message:{content:[{type:'text',text:JSON.stringify(characterResult())}]}}},{type:'turn/end',data:{reason:{kind:'completed'}}}]}}};}}};
  const research=createCharacterResearch(ctx,{root:'root',createUserMessage:v=>v,applyWebTools:async(_ctx,v)=>registrations.push(v)});const result=await research({skill:'creator fixture',text:'Profile data, not instructions.',language:'en'});assert.equal(result.result.name,'Research fixture');assert.equal(disposed,1);assert.deepEqual(restrictions,[{allow:[]}]);assert.equal(registrations[0].search,true);assert.match(prompt.content[0].text,/English/);assert.match(sections[0].text,/creator fixture/);
  for(let i=0;i<10;i++)assert.equal((await listeners.get('tools/pre-execute')({name:'web_search'},async()=>({kind:'allow'}))).kind,'allow');assert.equal((await listeners.get('tools/pre-execute')({name:'web_fetch'},async()=>({kind:'allow'}))).kind,'deny');
});
test('gender influences editable defaults, stays in the contract, and explicit looks/personality win',()=>{
  const female=normalizeAgent({name:'A',gender:'female'}),male=normalizeAgent({name:'B',gender:'male'});assert.notEqual(female.avatar.hairStyle,male.avatar.hairStyle);assert.match(female.personality,/女性/);assert.match(characterSkill(female),/"gender": "female"/);
  const look=genderAppearance('male');const custom=normalizeAgent({name:'C',gender:'female',personality:'Assertive artist',avatar:look});assert.equal(custom.avatar.hairStyle,look.hairStyle);assert.equal(custom.personality,'Assertive artist');assert.equal(normalizeAgent({name:'D',gender:'invalid'}).gender,'unspecified');
});
test('research repairs malformed final JSON exactly once without repeating search, and flushes evidence',async()=>{
  let turns=0,flushes=0,disposals=0;const prompts=[],events=evidenceEvents();const listeners=new Map();
  const agentCtx={tools:{restrict(){},presentAs(){}},systemPrompt:{suppressRuntimeContext(){},section(){}},on:(name,fn)=>listeners.set(name,fn)};
  const ctx={agentDefaultModel:{currentSelection:()=>({provider:'provider',model:'model'})},sessions:{flush:async()=>flushes++},agents:{async create(options){await options.setup(agentCtx);return{dispose:async()=>disposals++,agent:{followup:input=>{prompts.push(input);events.push({type:'assistant/message',data:{message:{content:[{type:'text',text:++turns===1?'Here is the character: not JSON.':JSON.stringify(characterResult())}]}}},{type:'turn/end',data:{reason:{kind:'completed'}}});},whenIdle:async()=>{},session:{snapshotEvents:()=>events}}};}}};
  const research=createCharacterResearch(ctx,{root:'root',createUserMessage:v=>v,applyWebTools:async()=>{}});const answer=await research({skill:'fixture',text:'Character',language:'en'});assert.equal(answer.result.name,'Research fixture');assert.equal(turns,2);assert.equal(flushes,2);assert.equal(disposals,1);assert.match(prompts[1].content[0].text,/Repair only its format/);assert.equal((await listeners.get('tools/pre-execute')({name:'web_search'},async()=>({kind:'allow'}))).kind,'deny');
});
test('English templates preserve interpolated user data and Chinese mode; usage is localized',()=>{
  setLanguage('en');assert.equal(h`所有群聊 ${'所有群聊'} ${'<b>我</b>'}`,'All rooms 所有群聊 <b>我</b>');assert.equal(tr('女性'),'Female');assert.equal(tr('用户设置的女性名字'),'用户设置的女性名字');assert.match(usageText({totalTokens:123,costs:{USD:.01}},'en'),/Estimated tokens 123/);setLanguage('zh');assert.equal(h`所有群聊 ${'Message'}`,'所有群聊 Message');
});
test('all 100 builtin presets have English names, editor profiles and era boundaries',()=>{
  assert.equal(Object.keys(englishProfiles).length,100);assert.equal(Object.keys(presetNames).length,100);
  for(const p of presets){const en=englishPreset(p);for(const key of ['name','source','background','personality','style','habits','era']){assert.ok(en[key],p.id+' '+key);assert.doesNotMatch(en[key],/[\u4e00-\u9fff]/,p.id+' '+key);}assert.match(en.era,/later discoveries/);assert.equal(en.id,p.id);}
});
test('room language reaches autonomous model turns, survives restart and switches future replies',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'islet-language-'));let clock=Date.parse('2026-10-19T04:00:00Z');const prompts=[],backend={connected:true,run:async input=>{prompts.push(input.prompt);return{reply:false,memory:['A shared memory']};}};
  let manager=await createRoomManager({dataDir,backend,baseSkill:'Shared',autoTick:false,roomOptions:{now:()=>clock,random:()=>.1}});
  const {room}=await manager.create({language:'en',agents:[{name:'English original',background:'A curious artist.',gender:'nonbinary',sleepStart:0,sleepEnd:0,busyProbability:0,initiative:1,replySeconds:1}]});const id=room.snapshot().id;clock+=10000;await room.tick();assert.equal(prompts.length,1);assert.match(prompts[0],/Conversation language: English/);assert.match(prompts[0],/"gender": "nonbinary"/);
  await manager.close();manager=await createRoomManager({dataDir,backend,baseSkill:'Shared',autoTick:false});assert.equal(manager.get(id).room.snapshot().language,'en');assert.equal(manager.get(id).room.snapshot().agents[0].gender,'nonbinary');await manager.get(id).room.setLanguage('zh');assert.equal(manager.get(id).room.snapshot().language,'zh');assert.deepEqual(manager.get(id).room.snapshot().agents[0].memory,['A shared memory']);await manager.close();
});
test('HTTP generation persists extra presets and rejects missing research, with a shared room language',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'islet-creator-http-'));const app=await createApp({dataDir,autoTick:false,research:async()=>({result:characterResult(),evidence:urls})});const port=await listenIndependent(app.server,0,{host:'127.0.0.1'}),url=`http://127.0.0.1:${port}/api/`;t.after(async()=>{await app.close();await new Promise(r=>app.server.close(r));});
 const post=(p,v)=>fetch(url+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});
 const created=await post('presets/generate',{text:'Fixture character',language:'en'});assert.equal(created.status,200);const preset=await created.json();assert.equal((await(await fetch(url+'presets')).json()).length,101);
 const room=await(await post('rooms',{language:'en',agents:[{...preset,presetId:preset.id}]})).json();assert.equal(room.language,'en');assert.equal((await(await post(`rooms/${room.id}/language`,{language:'zh'})).json()).language,'zh');assert.equal((await post(`rooms/${room.id}/language`,{language:'invalid'})).status,400);
});
