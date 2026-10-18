// USD per million tokens; verified 2026-10-18 against the official pricing page.
// Peak rates deliberately give a conservative estimate across time bands/holidays.
// https://api-docs.deepseek.com/quick_start/pricing/
const flash={input:0.3,output:1.2,cacheRead:0.006,cacheWrite:0.3,currency:'USD'};
const pro={input:1.32,output:3.96,cacheRead:0.044,cacheWrite:1.32,currency:'USD'};
export const defaultPrices=Object.freeze(Object.fromEntries([
  ...['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp'].map(m=>[`deepseek-official/${m}`,flash]),
  ['deepseek-official/deepseek-v4-pro',pro]
]));
const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function readPrices(raw=process.env.CHATROOM_TOKEN_PRICES){
  const prices={...defaultPrices};if(!raw)return prices;
  let custom;try{custom=JSON.parse(raw);}catch{throw Error('CHATROOM_TOKEN_PRICES 必须为 JSON 对象。');}
  if(!custom||Array.isArray(custom)||typeof custom!=='object')throw Error('CHATROOM_TOKEN_PRICES 必须为 JSON 对象。');
  for(const[key,p]of Object.entries(custom)){
    if(!key.includes('/')||!p||!['USD','CNY','EUR'].includes(p.currency)||!['input','output'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=0)||!['cacheRead','cacheWrite'].every(k=>p[k]===undefined||typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=0))throw Error(`模型 ${key} 的 Token 单价配置无效。`);
    prices[key]={...p};
  }
  return prices;
}
export function estimateTokens(text=''){
  // CJK characters carry more tokens than Latin prose; no tokenizer dependency.
  let cjk=0,other=0;for(const c of String(text)){if(/[\u2e80-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(c))cjk++;else other+=c.length;}
  return Math.ceil(cjk*1.5+other/4);
}
export function emptyUsage({partialHistory=false,now=Date.now()}={}){
  return {version:1,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:0,calls:0,estimatedCalls:0,unpricedCalls:0,costs:{},partialHistory,startedAt:now};
}
function normalizeSample(sample){
  if(!sample||!count(sample.inputTokens)||!count(sample.outputTokens))return null;
  const cacheReadTokens=sample.cacheReadTokens??0,cacheWriteTokens=sample.cacheWriteTokens??0;
  if(!count(cacheReadTokens)||!count(cacheWriteTokens))return null;
  let inputTokens=sample.inputTokens;const known=inputTokens+sample.outputTokens+cacheReadTokens+cacheWriteTokens;
  if(!Number.isSafeInteger(known))return null;
  if(sample.totalTokens!==undefined){if(!count(sample.totalTokens)||sample.totalTokens<known)return null;inputTokens+=sample.totalTokens-known;}
  return {inputTokens,outputTokens:sample.outputTokens,cacheReadTokens,cacheWriteTokens,totalTokens:inputTokens+sample.outputTokens+cacheReadTokens+cacheWriteTokens};
}
export function measureUsage(events,{inputText='',fallbackRoute=null,prices=defaultPrices,accepted=true}={}){
  const result=emptyUsage();
  const attempts=events.filter(e=>['assistant/message','assistant/attempt'].includes(e.type));
  if(!attempts.length&&accepted)attempts.push({data:{}});
  for(const event of attempts){
    const data=event.data||{},message=data.message;
    const sample=data.usage||data.stream?.findLast(r=>r.type==='chunk'&&r.chunk?.type==='usage')?.chunk.usage;
    let usage=normalizeSample(sample);
    if(!usage){
      const text=(message?.content||[]).map(b=>b.text||'').join('\n')||data.stream?.flatMap(r=>r.texts||[]).join('')||'';
      usage={inputTokens:estimateTokens(inputText),outputTokens:estimateTokens(text),cacheReadTokens:0,cacheWriteTokens:0};usage.totalTokens=usage.inputTokens+usage.outputTokens;result.estimatedCalls++;
    }
    for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens'])result[key]+=usage[key];
    result.calls++;
    const route=message?.source||fallbackRoute,p=route&&prices[`${route.provider}/${route.model}`];
    if(!p){result.unpricedCalls++;continue;}
    const cost=(usage.inputTokens*p.input+usage.outputTokens*p.output+usage.cacheReadTokens*(p.cacheRead??p.input)+usage.cacheWriteTokens*(p.cacheWrite??p.input))/1e6;
    result.costs[p.currency]=(result.costs[p.currency]||0)+cost;
  }
  return result;
}
export function addUsage(total,delta){
  for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens','calls','estimatedCalls','unpricedCalls'])if(count(delta?.[key]))total[key]+=delta[key];
  for(const[currency,cost]of Object.entries(delta?.costs||{}))if(['USD','CNY','EUR'].includes(currency)&&Number.isFinite(cost)&&cost>=0)total.costs[currency]=(total.costs[currency]||0)+cost;
  return total;
}
