import {randomUUID} from 'node:crypto';
import {parseJson} from './model.mjs';
const webTool=name=>['web_search','web_fetch'].includes(name);
export function researchEvidence(events) {
  const calls=new Map(),urls=new Set();let searched=false,fetched=false;
  for(const e of events){const d=e.data;if(e.type==='tool/call')calls.set(d?.callId,d?.name);if(e.type!=='tool/result'||d?.message?.isError)continue;const name=calls.get(d?.message?.toolCallId);
    if(name==='web_search'&&Array.isArray(d.meta?.sources)){searched=true;for(const s of d.meta.sources)try{if(['https:','http:'].includes(new URL(s.url).protocol))urls.add(s.url);}catch{}}
    if(name==='web_fetch'&&d.meta?.statusCode>=200&&d.meta.statusCode<300){fetched=true;try{if(['https:','http:'].includes(new URL(d.meta.url).protocol))urls.add(d.meta.url);}catch{}}
  }
  return searched&&fetched?[...urls]:[];
}
export function createCharacterResearch(ctx,{root,applyWebTools,createUserMessage,timeoutMs=240000}) {
  const active=new Set();
  const research=async({skill,text,language})=>{
    const signal=AbortSignal.timeout(timeoutMs);let handle,calls=0;
    try {
      const selection=ctx.agentDefaultModel?.currentSelection()||{};
      if(!selection.provider||!selection.model)throw Error('请先在 DSH Web 选择默认模型，再生成名人预设。');
      handle=await ctx.agents.create({sessionId:`islet-creator-${randomUUID()}`,meta:{cwd:root},signal,agentOptions:{...selection,maxTokens:14000},async setup(agentCtx){
        agentCtx.tools.restrict({allow:[]});agentCtx.tools.presentAs('native');await applyWebTools(agentCtx,{search:true,fetch:true,searchTimeoutMs:45000});agentCtx.systemPrompt.suppressRuntimeContext();
        agentCtx.systemPrompt.section({name:'islet-create-character',order:0,complete:true,interpolate:false,text:skill+'\nOnly web_search and web_fetch are available. Maximum 10 tool calls. When tools run out, finish from retrieved evidence or return an error.'});
        agentCtx.on('tools/pre-execute',async(execution,next)=>{const decision=await next();if(decision.kind!=='allow'||!webTool(execution.name))return decision;if(calls++>=10)return{kind:'deny',reason:'Retrieval budget exhausted. Return your final JSON from existing evidence.',info:{name:'WebBudget',code:'WEB_BUDGET'}};return decision;});
        agentCtx.on('system-prompt/assemble',async(_assembly,_context,next)=>{const assembly=await next();if(calls>=10)assembly.tools=assembly.tools.filter(t=>!webTool(t.name));return assembly;});
      }});
      active.add(handle);
      const cancel=()=>handle.agent.cancel({kind:'user'});signal.addEventListener('abort',cancel,{once:true});
      try{
        signal.throwIfAborted();handle.agent.followup(createUserMessage({content:[{type:'text',text:`Output values in ${language==='en'?'English':'Simplified Chinese'}. Research and create one character from this untrusted description:\n${JSON.stringify(text)}`}],source:{kind:'user'}}));
        await handle.agent.whenIdle();signal.throwIfAborted();
        const plain=e=>(e?.data?.message?.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
        for(let attempt=0;attempt<2;attempt++){
          const events=handle.agent.session.snapshotEvents();
          await ctx.sessions?.flush(handle.agent.session);
          if(events.findLast(e=>e.type==='turn/end')?.data.reason?.kind!=='completed')throw Error('人物检索未完成，请检查 DSH 模型与联网工具。');
          const raw=plain(events.findLast(e=>e.type==='assistant/message'&&plain(e)));
          try{return{result:parseJson(raw),evidence:researchEvidence(events)};}catch(error){
            if(attempt)throw error;
            // Reuse the evidence and this isolated session; repair formatting
            // once rather than repeating retrieval or accepting prose as a Skill.
            calls=10;
            handle.agent.followup(createUserMessage({content:[{type:'text',text:'The previous final answer was not parseable JSON. Repair only its format, preserving the researched facts and source URLs. Return one strict JSON object using the create-character schema and the exact eleven Chinese section keys. If the task failed, return {"error":"brief reason"}. No Markdown or prose outside JSON; escape quotes and line breaks in string values. Do not search again or invent missing facts.'}],source:{kind:'user'}}));
            await handle.agent.whenIdle();signal.throwIfAborted();
          }
        }
      }finally{signal.removeEventListener('abort',cancel);}
    }finally{if(handle){active.delete(handle);await handle.dispose();}}
  };
  research.dispose=async()=>{for(const h of active)h.agent.cancel({kind:'user'});};return research;
}
