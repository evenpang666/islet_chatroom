import test from 'node:test';
import assert from 'node:assert/strict';
import {appearanceDefaults,appearanceGroups,normalizeAppearance,randomAppearance} from '../public/appearance.js';
import {avatar} from '../public/avatar.js';
import {appearanceStudio,randomizeAppearance} from '../public/appearance-editor.js';

test('old six-field avatars retain their choices and gain complete new appearance defaults',()=>{
  const old={skin:'#123456',hair:'#234567',shirt:'#345678',background:'#456789',hairStyle:4,accessory:'earring'};
  const a=normalizeAppearance(old);for(const[k,v]of Object.entries(old))assert.equal(a[k],v);assert.equal(a.outfit,'tshirt');assert.equal(a.eyes,'dot');assert.deepEqual(Object.keys(a).sort(),Object.keys(appearanceDefaults).sort());
  assert.deepEqual(normalizeAppearance(null),normalizeAppearance());assert.deepEqual(normalizeAppearance({hairStyle:999,eyes:'<script>',shirt:'red',skin:'" onload="evil'}),normalizeAppearance());assert.equal(normalizeAppearance({hairStyle:'11'}).hairStyle,11);
});
test('every selectable appearance field has a visible distinct SVG representation',()=>{
  for(const group of appearanceGroups)for(const [key,,values]of group.fields){
    const renderings=values.map(([value])=>avatar({...appearanceDefaults,[key]:value},128,true));
    assert.equal(new Set(renderings).size,values.length,`${key} has duplicate option renderings`);
  }
  const malicious=avatar({skin:'<script>',hair:'" onload="evil',hat:'</svg>',outfit:'<img>'},'" onload="evil');assert.ok(!malicious.includes('evil'));assert.ok(!malicious.includes('<script>'));assert.match(malicious,/width="64"/);
  assert.match(avatar({},128,true),/viewBox="0 0 32 40"/);assert.match(avatar(),/viewBox="0 0 32 32"/);
});
test('random appearances are valid and diverse, with coherent independent color channels',()=>{
  let seed=123;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);const looks=new Set(),hair=new Set(),clothes=new Set();
  for(let i=0;i<250;i++){const a=randomAppearance(random);assert.deepEqual(a,normalizeAppearance(a));looks.add(JSON.stringify(a));hair.add(a.hairStyle);clothes.add(a.outfit);}
  assert.equal(looks.size,250);assert.equal(hair.size,12);assert.equal(clothes.size,11);
});
test('randomize changes only appearance and refreshes controls without remounting character fields',()=>{
  const character={name:'保留这个名字',background:'保留尚未提交的人设',timezone:'Asia/Shanghai',avatar:normalizeAppearance()};
  const old=structuredClone(character),preview={innerHTML:''},controls=Object.keys(appearanceDefaults).map(key=>({dataset:{avatar:key},value:''}));
  const root={querySelector:s=>{assert.equal(s,'#avatar-preview');return preview;},querySelectorAll:s=>{assert.equal(s,'[data-avatar]');return controls;}};
  randomizeAppearance(root,character,()=>.8);assert.deepEqual({...character,avatar:old.avatar},old);assert.notDeepEqual(character.avatar,old.avatar);assert.ok(preview.innerHTML.includes('<svg'));for(const c of controls)assert.equal(c.value,character.avatar[c.dataset.avatar]);
  const html=appearanceStudio(character.avatar);for(const g of appearanceGroups){assert.ok(html.includes(`appearance-tab-${g.id}`));for(const [key]of [...g.fields,...g.colors])assert.ok(html.includes(`data-avatar="${key}"`));}
});
