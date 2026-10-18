const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export function clipText(value,max) {
  if(value.length<=max)return value;
  let result='';for(const {segment} of segmenter.segment(value)){if(result.length+segment.length>max)break;result+=segment;}return result;
}
export const firstGrapheme=value=>segmenter.segment(value)[Symbol.iterator]().next().value?.segment||'';
export const textLength=value=>[...segmenter.segment(value)].length;

export function usageText(usage){
  if(!usage)return'本聊天室累计 · 估算 Token 暂无统计 · 估算费用 暂无统计';
  const tokens=new Intl.NumberFormat('zh-CN').format(usage.totalTokens||0);
  const costs=Object.entries(usage.costs||{}).filter(([,value])=>Number.isFinite(value)&&value>=0).map(([currency,value])=>new Intl.NumberFormat('zh-CN',{style:'currency',currency,minimumFractionDigits:4,maximumFractionDigits:6}).format(value));
  const amount=costs.join(' + ')||((usage.calls||0)>0?'待配置单价':'US$0.0000');
  return `本聊天室累计 · 估算 Token ${tokens} · 估算费用 ${amount}${usage.unpricedCalls&&costs.length?'（部分未计价）':''}${usage.partialHistory?' · 自更新后统计':''}`;
}
export function usageDetail(usage){
  if(!usage)return'重启 DSH Web 加载新版后台后开始统计。';
  const input=(usage.inputTokens||0)+(usage.cacheReadTokens||0)+(usage.cacheWriteTokens||0);
  return `累计输入 ${input}，输出 ${usage.outputTokens||0}（含推理），缓存读取 ${usage.cacheReadTokens||0}；${usage.calls||0} 次模型请求，其中 ${usage.estimatedCalls||0} 次按文本长度估算。包括主动发言、决定沉默与格式重试。费用使用 DeepSeek 官方公开高峰单价或自定义单价估算，非实际账单。${usage.unpricedCalls?`${usage.unpricedCalls} 次请求缺少模型单价。`:''}${usage.partialHistory?'更新前的历史用量不可追溯，未计入。':''}`;
}
