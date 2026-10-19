import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {characterSections} from './character-skills.mjs';
import {normalizeAgent} from './room.mjs';
import {replaceFile} from './store.mjs';

export function validateCreatedCharacter(result,evidence) {
  if(!result||typeof result!=='object')throw Error('人物生成结果无效。');
  if(typeof result.error==='string')throw Error('人物检索未完成：'+result.error.slice(0,350));
  const sources=(Array.isArray(result.sources)?result.sources:[]).filter(s=>typeof s?.url==='string'&&evidence.includes(s.url));
  if(new Set(sources.map(s=>s.url)).size<2)throw Error('未取得至少两条实际检索来源，请补充人物信息后重试。');
  const sections={};
  for(const key of characterSections){const text=result.sections?.[key];if(typeof text!=='string'||text.trim().length<45||text.length>4000)throw Error(`人物 Skill 的「${key}」内容不完整。`);sections[key]=text.trim();}
  if((sections['每日行动'].match(/\b\d{2}:\d{2}\b/g)||[]).length<6)throw Error('人物每日行动需要至少六个时间安排。');
  if(typeof result.name!=='string'||!result.name.trim()||typeof result.background!=='string'||!result.background.trim())throw Error('人物缺少名字或背景。');
  const id='generated-'+randomUUID();
  const a=normalizeAgent({...result,era:sections['生活年代'],personality:result.personality||sections['性格与驱动力'],style:result.style||sections['说话方式'],habits:result.habits||sections['生活习性']});
  const {memory,sessionId,runtime,id:instance,characterId,presetId,...fields}=a;
  const cleanSources=[...new Map(sources.map(s=>[s.url,{url:s.url,title:String(s.title||s.url).slice(0,300)}])).values()].slice(0,12);
  const contract=`# ${a.name}\n\nAI 创作演绎。资料中的日常细节和示例不是本人言论；用户的明确编辑优先于默认值。\n\n${characterSections.map(key=>`## ${key}\n${sections[key]}`).join('\n\n')}\n\n## 参考来源\n${cleanSources.map(s=>`- ${s.title}: ${s.url}`).join('\n')}`;
  return {...fields,id,source:String(result.source||'检索生成的人物预设').slice(0,300),category:'额外预设',contract,sources:cleanSources,createdAt:Date.now()};
}
export async function createCharacterLibrary({dataDir,research}) {
  const directory=join(dataDir,'presets');await mkdir(directory,{recursive:true,mode:0o700});
  const entries=new Map();
  for(const file of await readdir(directory)){if(!/^generated-[a-f\d-]{36}\.json$/.test(file))continue;const entry=JSON.parse(await readFile(join(directory,file),'utf8'));if(file!==entry.id+'.json'||typeof entry.contract!=='string')throw Error('额外角色库格式无效，原文件已保留。');entries.set(entry.id,entry);}
  let creating=false;
  return {
    list(){return [...entries.values()].map(({contract,...entry})=>entry);},
    get(id){return entries.get(id);},
    async generate({text,language='zh'}) {
      if(creating){const error=Error('正在生成名人预设，请稍候。');error.status=429;throw error;}
      if(typeof text!=='string'||text.trim().length<2||text.length>5000)throw Error('请输入 2–5000 字的人物信息。');
      if(!research)throw Error('请重启 DSH Web 加载人物检索服务后再生成预设。');
      creating=true;
      try {
        const skill=await readFile(new URL('../skills/create-character/SKILL.md',import.meta.url),'utf8');
        const {result,evidence}=await research({skill,text:text.trim(),language:language==='en'?'en':'zh'});
        const entry=validateCreatedCharacter(result,evidence),temp=join(directory,`.${entry.id}.tmp`),target=join(directory,entry.id+'.json');
        const skillDir=join(directory,entry.id);await mkdir(skillDir,{recursive:true,mode:0o700});
        await writeFile(join(skillDir,'SKILL.md'),`---\nname: ${entry.id}\ndescription: Researched Islet character preset for ${entry.id}.\n---\n${entry.contract}\n`,{mode:0o600});
        try{await writeFile(temp,JSON.stringify(entry,null,2),{mode:0o600});await replaceFile(temp,target);}finally{await rm(temp,{force:true});}
        entries.set(entry.id,entry);const {contract,...publicEntry}=entry;return publicEntry;
      }finally{creating=false;}
    }
  };
}
