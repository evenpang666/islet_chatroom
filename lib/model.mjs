import { randomUUID } from 'node:crypto';

const plain = message => (message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
export function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { const result = JSON.parse(cleaned); if (result && typeof result === 'object' && !Array.isArray(result)) return result; } catch {}
  throw Error('角色返回了无效的 JSON，请重试或检查 DSH 模型。');
}

export function createDshBackend(ctx, { root, timeoutMs = 120000 } = {}) {
  const running = new Map();
  const restricted=new WeakSet();
  return {
    connected: true,
    async run({ sessionId, title, prompt, signal, timezone='Asia/Shanghai', responseType='object', onSession = async () => {} }) {
      const abort = new AbortController();
      const combined = AbortSignal.any([abort.signal, AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
      // One persistent DSH session per role; memory/context also live in local storage.
      if (sessionId) {
        try { const inspected = await ctx.sessionController.inspect(sessionId); if (inspected.meta?.cwd !== root) sessionId = null; }
        catch { sessionId = null; }
      }
      if (!sessionId) {
        const created = await ctx.sessionController.create({ cwd: root, agentPreset:'chatroom-character' });
        sessionId = created.sessionId;
        await ctx.sessionController.rename({ sessionId, title });
        await onSession(sessionId);
      }
      const resolved = await ctx.sessionController.resolveAgent(sessionId);
      if (resolved.error || !resolved.agent) throw Error('无法启动 DSH 角色，请在 DSH Web 中配置模型与凭据。');
      const agent = resolved.agent;
      if(!restricted.has(agent)) {agent.ctx.get('tools').restrict({allow:[]});restricted.add(agent);}
      let accepted = false;
      const cancel = () => { if (accepted) Promise.resolve(ctx.sessionController.cancel({ sessionId })).catch(() => {}); };
      combined.addEventListener('abort', cancel, { once: true });
      running.set(sessionId, abort);
      let rejectAbort;
      const cancelled = new Promise((_, reject) => { rejectAbort = () => reject(Error('DSH 角色生成已取消或超时。')); combined.addEventListener('abort', rejectAbort, { once: true }); if (combined.aborted) rejectAbort(); });
      // Attach rejection handler before prompt may block.
      cancelled.catch(() => {});
      try {
        for(let attempt=0;attempt<2;attempt++) {
          const previous=agent.session.snapshotEvents().at(-1)?.seq??-1;
          accepted=false;
          await ctx.sessionController.prompt({ sessionId, requestId: `chatroom-${randomUUID()}`, mode: 'queue', content: [{ type: 'text', text: prompt }], clientTimeZone: timezone }, combined);
          accepted=true;if(combined.aborted)cancel();
          await Promise.race([agent.whenIdle(),cancelled]);
          const events=agent.session.snapshotEvents().filter(e=>e.seq>previous);
          const end=events.findLast(e=>e.type==='turn/end');
          if(end?.data?.reason?.kind!=='completed')throw Error('DSH 角色未完成回复，请在 DSH Web 检查模型、权限或用量。');
          const message=events.findLast(e=>e.type==='assistant/message'&&plain(e.data.message));
          if(!message)throw Error('DSH 未返回角色消息。');
          await ctx.sessions.flush(agent.session);
          try {
            const result=parseJson(plain(message.data.message));
            if(responseType==='chat'&&(typeof result.reply!=='boolean'||result.reply&&(typeof result.text!=='string'||!result.text.trim())))throw Error('角色返回格式不完整。');
            return result;
          }catch(e){
            if(attempt)throw e;
            // A single bounded format repair: never turn a parsing failure into
            // fabricated dialogue, nor publish an unvalidated model response.
            prompt=`上一条最终输出未满足 JSON 格式。仅修复格式，保留原语义，不编造新发言、记忆或状态。${responseType==='chat'?'返回 {"reply":true或false,"text":"原来的短消息，沉默时为空","memory":["原有记忆"],"busyMinutes":0}；reply 必须为布尔值。':'按先前约定的字段返回一个 JSON 对象。'}只输出严格 JSON，不加解释或 Markdown。`;
          }
        }
      } finally {
        running.delete(sessionId);
        combined.removeEventListener('abort', cancel);
        combined.removeEventListener('abort', rejectAbort);
      }
    },
    dispose() { for (const abort of running.values()) abort.abort(); }
  };
}
