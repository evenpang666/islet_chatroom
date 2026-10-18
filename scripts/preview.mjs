import { createApp } from '../lib/server.mjs';
import { listenIndependent } from '../lib/independent-http.mjs';
import { fileURLToPath } from 'node:url';
const app=await createApp({dataDir:process.env.CHATROOM_DATA_DIR || fileURLToPath(new URL('../.local/preview/',import.meta.url)),backend:null});
const port=await listenIndependent(app.server,process.env.CHATROOM_PORT||3104);
console.log(`浮岛界面预览：http://127.0.0.1:${port}/ · 接入 AI 请运行 start.bat / start.sh`);
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await app.close();app.server.close();});
