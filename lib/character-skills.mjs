import {readFile} from 'node:fs/promises';

export const characterSections=['人物背景','性格与驱动力','说话方式','生活习性','群聊行为','关系与记忆','演绎边界','自然发言示例'];
export function parseCharacterSkill(source,id) {
  if(typeof id!=='string'||!/^[a-z]+$/.test(id))throw Error('无效的预设角色 ID');
  const header=source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if(!header||!new RegExp(`^name: chatroom-${id}$`,'m').test(header[1].replace(/\r/g,''))||!/^description: .+/m.test(header[1]))throw Error(`角色 ${id} 的 Skill 元信息无效`);
  const content=source.slice(header[0].length).trim();
  const sections={};
  for(const title of characterSections){
    const match=content.match(new RegExp(`^## ${title}\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`,'m'));
    if(!match?.[1].trim())throw Error(`角色 ${id} 的 Skill 缺少 ${title}`);
    sections[title]=match[1].trim();
  }
  return {id,name:`chatroom-${id}`,content,sections};
}
export async function loadCharacterSkill(id) {
  if(typeof id!=='string'||!/^[a-z]+$/.test(id))throw Error('无效的预设角色 ID');
  return parseCharacterSkill(await readFile(new URL(`../skills/characters/chatroom-${id}/SKILL.md`,import.meta.url),'utf8'),id);
}
