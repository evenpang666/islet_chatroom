import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {presets,presetSkill} from '../lib/presets.mjs';
import {loadCharacterSkill,parseCharacterSkill,characterSections} from '../lib/character-skills.mjs';
import {normalizeAgent,characterSkill} from '../lib/room.mjs';
import {createRoomManager} from '../lib/rooms.mjs';

test('all 50 shipped character skills have distinct substantial sections and original voice examples',async()=>{
  const dirs=(await readdir(new URL('../skills/characters/',import.meta.url),{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);
  assert.deepEqual(dirs.sort(),presets.map(p=>'chatroom-'+p.id).sort());
  const styles=new Set(),contents=new Set();
  for(const p of presets){const skill=await loadCharacterSkill(p.id);assert.equal(p.skillId,skill.name);assert.equal(p.background,skill.sections['人物背景']);assert.equal(p.style,skill.sections['说话方式']);
    for(const key of characterSections)assert.ok(skill.sections[key].length>=45,`${p.id}: ${key}`);
    assert.match(skill.sections['自然发言示例'],/原创/);assert.equal(skill.sections['自然发言示例'].match(/“/g).length,3);styles.add(p.style);contents.add(skill.content);
  }
  assert.equal(styles.size,50);assert.equal(contents.size,50);
});
test('invalid skill IDs, malformed contracts and missing sections fail explicitly',async()=>{
  await assert.rejects(loadCharacterSkill('../SKILL'),/无效/);
  const source=await readFile(new URL('../skills/characters/chatroom-harry/SKILL.md',import.meta.url),'utf8');
  assert.throws(()=>parseCharacterSkill(source,'ron'),/元信息/);
  assert.throws(()=>parseCharacterSkill(source.replace('## 群聊行为','## Removed'),'harry'),/缺少 群聊行为/);
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
