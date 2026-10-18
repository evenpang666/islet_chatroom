import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
async function check(dir) {for(const file of await readdir(dir,{withFileTypes:true})) {if(['node_modules','.local','.runtime','test-results'].includes(file.name)) continue;const path=join(dir,file.name);if(file.isDirectory()) await check(path);else if(/\.[cm]?js$/.test(path)){const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit',windowsHide:true});if(r.status) process.exitCode=1;}}}
await check('.');
