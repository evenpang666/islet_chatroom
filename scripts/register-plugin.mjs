import { readFile, realpath, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname, basename, delimiter } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { findPnpm,findNpm,runInstaller } from './dsh-runtime.mjs';
import { registrationCurrent, rememberRegistration } from './dsh-version.mjs';

const execute = promisify(execFile);
const begin = '# >>> chatroom launcher >>>', end = '# <<< chatroom launcher <<<';

export async function chatroomInstalled(home, root) {
  try {
    const profile = join(home, 'profiles/web');
    const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
    return Object.hasOwn(manifest.dependencies || {}, 'chatroom') && manifest.dsh?.profile?.bundles?.includes('chatroom') &&
      await realpath(join(profile, 'node_modules/chatroom')) === await realpath(root);
  } catch { return false; }
}

// Only migrate the block owned by this launcher. Other user YAML stays intact.
export function migrateLauncherPatch(text) {
  const first = text.indexOf(begin), last = text.indexOf(end);
  if (first < 0 && last < 0) return text;
  if (first < 0 || last < first) throw new Error('浮岛配置标记不完整，请检查 DSH profile 的 cordis.patch.yml。');
  const block = text.slice(first + begin.length, last);
  if (!/^\s*- insert:\s*$/m.test(block)) return text;
  if (!/^    - id: chatroom\s*$/m.test(block) || (block.match(/^    - /gm) || []).length !== 1)
    throw new Error('浮岛配置块包含额外条目，无法安全迁移。');
  const migrated = block.replace(/^\s*- insert:\s*\n/, '\n').split('\n').map(line => line.startsWith('    ') ? line.slice(4) : line)
    .filter(line => !/^  name:/.test(line)).join('\n');
  return text.slice(0, first + begin.length) + migrated + text.slice(last);
}

async function savePatch(path, expected, next) {
  if (expected === next) return;
  if (await readFile(path, 'utf8') !== expected) throw new Error('DSH 配置同时被修改，请重试浮岛注册。');
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, next, { mode: 0o600 }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function registerChatroom({ home, root, runtime, env = process.env, run = execute, locatePnpm = findPnpm, log = console.log }) {
  const profile = join(home, 'profiles/web'), path = join(profile, 'cordis.patch.yml');
  let original;
  try { original = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const migrated = original === undefined ? undefined : migrateLauncherPatch(original);
  const installed = await chatroomInstalled(home, root);
  if (installed && registrationCurrent(profile, 'chatroom', runtime?.version)) { if (migrated !== undefined) await savePatch(path, original, migrated); return; }
  const childEnv = { ...env, DSH_HOME: home };
  let metadata = {};
  try {
    const text = await readFile(join(profile, 'node_modules/.modules.yaml'), 'utf8');
    try { metadata = JSON.parse(text); } catch {
      for (const key of ['packageManager', 'storeDir']) metadata[key] = text.match(new RegExp(`^${key}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm'))?.[1]?.trim();
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (metadata.storeDir) {
    const store = /^v\d+$/.test(basename(metadata.storeDir)) ? dirname(metadata.storeDir) : metadata.storeDir;
    delete childEnv.NPM_CONFIG_STORE_DIR;
    childEnv.npm_config_store_dir = store; childEnv.PNPM_CONFIG_STORE_DIR = store;
  }
  const required = metadata.packageManager?.match(/^pnpm@(\d+)/)?.[1];
  let pnpm = await locatePnpm(childEnv), version;
  try {if(pnpm) version=(await run(pnpm.command,[...pnpm.args,'--version'],{env:childEnv,timeout:10000,windowsHide:true})).stdout.trim();}catch{}
  if(!version || (required ? version.split('.')[0]!==required : Number(version.split('.')[0])<10)) {
    const major=required||'10',prefix=join(root,'.runtime',`pnpm-${major}`),bin=join(prefix,'node_modules/.bin');
    childEnv.PATH=bin+delimiter+(childEnv.PATH||childEnv.Path||'');
    pnpm=await locatePnpm(childEnv);
    try {version=pnpm?(await run(pnpm.command,[...pnpm.args,'--version'],{env:childEnv,timeout:10000,windowsHide:true})).stdout.trim():null;}catch{version=null;}
    if(!version || version.split('.')[0]!==major) {
      log(`正在为启动器准备 pnpm ${major}，保留已有的全局环境…`);
      const npm=await findNpm(childEnv);
      await runInstaller(npm.command,[...npm.args,'install','--prefix',prefix,'--no-save','--no-package-lock','--no-audit','--no-fund',`pnpm@${major}`],{env:childEnv,cwd:root});
      pnpm=await locatePnpm(childEnv);
      if(!pnpm)throw Error('pnpm 自动配置失败，请检查网络与目录权限。');
      version=(await run(pnpm.command,[...pnpm.args,'--version'],{env:childEnv,timeout:10000,windowsHide:true})).stdout.trim();
      if(version.split('.')[0]!==major)throw Error('pnpm 安装后的版本校验未通过。');
    }
  }
  try {
    if (migrated !== undefined) await savePatch(path, original, migrated);
    log('正在将浮岛注册到 DSH Web 插件列表…');
    await run(runtime.command, [...runtime.args, 'plugin', '--profile', 'web', 'add', `link:${root}`], { cwd: root, env: childEnv, timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true });
    if (!await chatroomInstalled(home, root)) throw new Error('DSH 未完成浮岛 bundle 注册。');
    rememberRegistration(profile, 'chatroom', runtime?.version);
  } catch (error) {
    if (migrated !== undefined && migrated !== original && !await chatroomInstalled(home, root)) {
      try { await savePatch(path, migrated, original); } catch {}
    }
    throw new Error(`浮岛插件注册失败：${error.message}`);
  }
}
