import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRoomManager} from '../lib/rooms.mjs';
import {presets} from '../lib/presets.mjs';
import {characterKey,selectionConflict} from '../public/lobby.js';

const seed=(id='tony')=>({...presets.find(p=>p.id===id),presetId:id,sleepStart:0,sleepEnd:0,replySeconds:1,busyProbability:0});
async function fixture(t){
  const dataDir=await mkdtemp(join(tmpdir(),'islet-occupancy-')),config={dataDir,autoTick:false};
  const manager=await createRoomManager(config);t.after(()=>manager.close());return{manager,config,dataDir};
}
test('one preset occupies all active rooms until removal or dissolution; rename, pause and duplicate slots cannot bypass it',async t=>{
  const {manager}=await fixture(t),first=await manager.create({name:'已有群聊',agents:[seed()]});
  const id=first.room.snapshot().id,a=first.store.state.agents[0];await first.room.pause(true);
  await assert.rejects(manager.create({agents:[{...seed(),name:'改名的托尼'}]}),e=>e.status===409&&e.message.includes('已有群聊'));
  assert.equal(manager.occupiedCharacters().length,1);
  await assert.rejects(manager.create({agents:[seed('harry'),seed('harry')]}),e=>e.status===409);
  await manager.removeAgent(id,a.id);assert.equal(first.room.snapshot().agents.length,0);assert.equal(manager.occupiedCharacters().length,0);
  assert.equal(first.store.state.removedAgents[0].id,a.id);assert.equal(first.store.state.removedAgents[0].presetId,'tony');
  const second=await manager.create({agents:[seed()]});await manager.dissolve(second.room.snapshot().id);
  assert.equal(manager.occupiedCharacters().length,0);await manager.create({agents:[seed()]});
});
test('concurrent manager callers cannot reserve the same character twice, including bare preset objects',async t=>{
  const {manager}=await fixture(t),role=presets.find(p=>p.id==='tony');
  const result=await Promise.allSettled([manager.create({agents:[role]}),manager.create({agents:[role]})]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
  assert.equal(manager.list().length,1);assert.equal(manager.occupiedCharacters()[0].key,'preset:tony');
});
test('custom identity is stable across rename, new rooms and service restart while unrelated same-name originals remain distinct',async t=>{
  const {manager,config,dataDir}=await fixture(t);
  const first=await manager.create({agents:[{name:'小林',background:'原创角色'}]});const id=first.room.snapshot().id,a=first.room.snapshot().agents[0];
  await manager.create({agents:[{name:'小林',background:'另一位原创人物'}]});assert.equal(manager.occupiedCharacters().length,2);
  await manager.close();const reopened=await createRoomManager(config);t.after(()=>reopened.close());
  await assert.rejects(reopened.create({agents:[{...a,name:'新名字'}]}),e=>e.status===409);
  await reopened.removeAgent(id,a.id);const next=await reopened.create({agents:[{...a,name:'新名字'}]});
  assert.equal(characterKey(next.room.snapshot().agents[0]),characterKey(a));
  const archive=JSON.parse(await readFile(join(dataDir,'rooms',id,'room.json'),'utf8'));
  assert.ok(archive.removedAgents[0].removedAt);assert.equal(archive.agents.length,0);assert.equal(reopened.list().length,3);
});
test('older duplicate rooms are preserved; a new invitation stays blocked until every old instance is released',async t=>{
  const {manager,config}=await fixture(t);const first=await manager.create({agents:[seed()]});const second=await manager.create({agents:[seed('harry')]});
  second.store.state.agents[0].presetId='tony';await second.store.save();await manager.close();
  const restored=await createRoomManager(config);t.after(()=>restored.close());assert.equal(restored.list().length,2);
  await restored.dissolve(first.room.snapshot().id);await assert.rejects(restored.create({agents:[seed()]}),e=>e.status===409);
  await restored.dissolve(second.room.snapshot().id);await restored.create({agents:[seed()]});
});
test('picker checks all rooms and other draft slots but permits editing the current slot',()=>{
  const tony=seed(),harry=seed('harry');
  assert.match(selectionConflict(tony,{occupiedCharacters:[{key:'preset:tony',roomName:'实验室'}]}),/实验室/);
  assert.match(selectionConflict(tony,{drafts:[tony,harry],slot:1}),/第 1 位/);
  assert.equal(selectionConflict(tony,{drafts:[tony,harry],slot:0}),'');
  assert.equal(selectionConflict(harry,{occupiedCharacters:[{key:'preset:tony',roomName:'实验室'}]}),'');
});
