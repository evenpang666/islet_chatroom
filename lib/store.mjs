import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Windows indexing can briefly lock the destination. Preserve it and retry.
export async function replaceFile(source,target) {
  for(let attempt=0;;attempt++)try{return await rename(source,target);}catch(error){if(attempt>=5||!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;await new Promise(r=>setTimeout(r,20*2**attempt));}
}

export async function createStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'room.json');
  let state;
  try { state = JSON.parse(await readFile(path, 'utf8')); if (state.version !== 1 || !Array.isArray(state.messages) || !Array.isArray(state.agents)) throw Error('不支持的聊天室数据格式'); }
  catch (error) { if (error.code !== 'ENOENT') throw Error(`无法读取聊天室数据，原文件已保留：${error.message}`); state = { version: 1, revision: 0, name: '一些有趣的灵魂', topic: '今天，有什么值得聊聊的小事？', timezone: 'Asia/Shanghai', started: false, paused: false, agents: [], messages: [], createdAt: Date.now() }; }
  let pending = Promise.resolve();
  const save = () => {
    state.revision++;
    const snapshot = JSON.stringify(state, null, 2);
    const next = pending.catch(() => {}).then(async () => {
      const temporary = join(directory, `.room-${randomUUID()}.tmp`);
      try { await writeFile(temporary, snapshot, { mode: 0o600 }); await replaceFile(temporary, path); }
      finally { await rm(temporary, { force: true }); }
    });
    pending = next;
    return next;
  };
  return { state, directory, save, flush: () => pending };
}
