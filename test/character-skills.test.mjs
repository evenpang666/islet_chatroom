import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {presets,presetSkill} from '../lib/presets.mjs';
import {loadCharacterSkill,parseCharacterSkill,characterSections} from '../lib/character-skills.mjs';
import {normalizeAgent,characterSkill} from '../lib/room.mjs';
import {createRoomManager} from '../lib/rooms.mjs';

test('all 100 shipped character skills have distinct substantial sections and original voice examples',async()=>{
  const dirs=(await readdir(new URL('../skills/characters/',import.meta.url),{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);
  assert.deepEqual(dirs.sort(),presets.map(p=>'chatroom-'+p.id).sort());
  const styles=new Set(),contents=new Set();
  for(const p of presets){const skill=await loadCharacterSkill(p.id);assert.equal(p.skillId,skill.name);assert.equal(p.background,skill.sections['人物背景']);assert.equal(p.style,skill.sections['说话方式']);
    for(const key of characterSections)assert.ok(skill.sections[key].length>=45,`${p.id}: ${key}`);
    assert.match(skill.sections['自然发言示例'],/原创/);assert.equal(skill.sections['自然发言示例'].match(/“/g).length,3);styles.add(p.style);contents.add(skill.content);
  }
  assert.equal(styles.size,100);assert.equal(contents.size,100);
});
test('screen characters are a separate category with explicit continuity and local time settings',()=>{
  const counts=Object.fromEntries([...new Set(presets.map(p=>p.category))].map(c=>[c,presets.filter(p=>p.category===c).length]));
  assert.deepEqual(counts,{'小说角色':35,'科学家':17,'文学家':23,'影视人物':25});
  for(const id of ['tony','leia','spock','walle','sheldon']){
    const p=presets.find(p=>p.id===id);assert.equal(p.category,'影视人物');assert.ok(p.source);assert.doesNotThrow(()=>new Intl.DateTimeFormat('en',{timeZone:p.timezone}));
    assert.match(presetSkill(id),/## 每日行动/);assert.match(presetSkill(id),/## 偶发行动/);
  }
  assert.equal(presets.find(p=>p.id==='harry').category,'小说角色');
  assert.equal(presets.find(p=>p.id==='tony').avatar.outfit,'armor');
});
test('invalid skill IDs, malformed contracts and missing sections fail explicitly',async()=>{
  await assert.rejects(loadCharacterSkill('../SKILL'),/无效/);
  const source=await readFile(new URL('../skills/characters/chatroom-harry/SKILL.md',import.meta.url),'utf8');
  assert.throws(()=>parseCharacterSkill(source,'ron'),/元信息/);
  assert.throws(()=>parseCharacterSkill(source.replace('## 群聊行为','## Removed'),'harry'),/缺少 群聊行为/);
});
test('all presets expose era boundaries, with historical dates, separate fictional calendars and user overrides',()=>{
  for(const p of presets){assert.ok(p.era.length>100);assert.match(p.era,/\d{1,4}.*[–至]|[–至].*\d{1,4}/);assert.match(p.era,/知识边界/);assert.match(p.era,/时代习惯/);}
  assert.match(presets.find(p=>p.id==='einstein').era,/1879–1955/);assert.match(presets.find(p=>p.id==='sushi').era,/1037–1101/);
  assert.match(presets.find(p=>p.id==='leia').era,/BBY.*ABY/);assert.match(presets.find(p=>p.id==='bilbo').era,/第三纪元/);
  const role=normalizeAgent({...presets[0],presetId:'harry',era:'公元 2050–2060 年，用户改写的未来园丁背景'});assert.match(characterSkill(role),/2050–2060/);
  assert.match(characterSkill(role),/现实钟表只用于生活节律/);
});
test('a role receives only its selected skill, with explicit user settings above preset defaults',()=>{
  const role=normalizeAgent({...presets[0],presetId:'harry',name:'成年后的哈利',background:'现任园丁，在上海工作',style:'慢慢说，喜欢谈植物',timezone:'Asia/Shanghai'});
  const content=characterSkill(role);assert.ok(content.includes(presetSkill('harry')));assert.ok(!content.includes(presetSkill('ron')));
  assert.ok(content.indexOf('以这些自定义为准')>content.indexOf(presetSkill('harry')));assert.match(content,/现任园丁，在上海工作/);assert.match(content,/慢慢说，喜欢谈植物/);
  const custom=characterSkill(normalizeAgent({name:'小林',background:'原创人物',presetId:'../../harry',skill:'untrusted'}));assert.ok(!custom.includes('霍格沃茨'));assert.ok(!custom.includes('untrusted'));
});
test('selected skill reaches the model, persists per-role, and is rebuilt on restore without losing user changes',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'islet-skills-'));let prompt;
  const config={dataDir,autoTick:false,backend:{connected:true,run:async r=>{prompt=r.prompt;return{reply:false,memory:['用户喜欢园艺']};}},roomOptions:{now:()=>Date.parse('2026-10-18T08:00:00Z'),random:()=>0}};
  const manager=await createRoomManager(config);t.after(()=>manager.close());
  const {room,store}=await manager.create({agents:[{...presets[0],presetId:'harry',background:'一位在上海工作的园丁',sleepStart:0,sleepEnd:0,avatar:{hairStyle:11,outfit:'overalls',eyes:'wink',hat:'beret',pants:'#123456'}}]});
  const id=room.snapshot().id,a=store.state.agents[0];await room.message({text:'保存外观和记忆 👋'});a.runtime.nextAt=0;await room.tick();
  assert.ok(prompt.includes(presetSkill('harry')));assert.ok(!prompt.includes(presetSkill('einstein')));assert.match(prompt,/在上海工作的园丁/);
  const skillPath=join(dataDir,'rooms',id,'skills',a.id,'SKILL.md');assert.ok((await readFile(skillPath,'utf8')).includes(presetSkill('harry')));
  await room.pause(true);await manager.close();
  const reopened=await createRoomManager(config);t.after(()=>reopened.close());const saved=reopened.get(id).room.snapshot();
  assert.equal(saved.agents[0].avatar.outfit,'overalls');assert.equal(saved.agents[0].avatar.hairStyle,11);assert.equal(saved.agents[0].avatar.pants,'#123456');assert.equal(saved.agents[0].avatar.eyes,'wink');assert.equal(saved.agents[0].avatar.hat,'beret');assert.equal(saved.agents[0].background,'一位在上海工作的园丁');assert.deepEqual(saved.agents[0].memory,['用户喜欢园艺']);assert.equal(saved.messages.length,1);assert.ok(saved.paused);assert.ok(!Object.hasOwn(saved.agents[0],'skill'));
});
test('old rooms gain missing preset eras on restore while explicit custom eras and private memories survive',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'islet-era-migration-')),config={dataDir,autoTick:false};
  const manager=await createRoomManager(config);t.after(()=>manager.close());
  const record=await manager.create({agents:[{...presets[0],presetId:'harry'},{...presets[25],presetId:'einstein',era:'公元 2050–2060 年，明确改写的未来研究者'}]});
  const id=record.room.snapshot().id;delete record.store.state.agents[0].era;record.store.state.agents[0].memory=['保留的个人记忆'];await record.store.save();await manager.close();
  const restored=await createRoomManager(config);t.after(()=>restored.close());const saved=restored.get(id).room.snapshot();
  assert.match(saved.agents[0].era,/1991–1998/);assert.deepEqual(saved.agents[0].memory,['保留的个人记忆']);assert.match(saved.agents[1].era,/2050–2060/);
});
