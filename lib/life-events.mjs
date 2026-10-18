// A low-frequency opportunity, never a roll per HTTP poll or model reply.
export const eventInterval=30*60*1000;
export const eventCooldown=2*60*60*1000;
export const eventProbability=.02;
const cues=['手边物品需要临时整理或修补','熟悉的日常里出现一个小小变化','忽然想到一个想试试的点子','一件不紧急的小事需要照料'];
// Returns whether private scheduling data changed and needs persisting.
export function sampleLifeEvent(runtime,timestamp,random=Math.random) {
  if(!Number.isFinite(runtime.eventCheckAt)){runtime.eventCheckAt=timestamp;return true;}
  if(timestamp-runtime.eventCheckAt<eventInterval)return false;
  runtime.eventCheckAt=timestamp; // No catch-up lottery after sleep, pause or downtime.
  if(timestamp<(runtime.eventCooldownUntil||0)||random()>=eventProbability)return true;
  const index=Math.min(cues.length-1,Math.max(0,Math.floor(random()*cues.length)));
  runtime.lifeEvent={cue:cues[index],at:timestamp,expiresAt:timestamp+90*60*1000};
  runtime.eventCooldownUntil=timestamp+eventCooldown;
  return true;
}
export function lifeContext(runtime,timestamp) {
  const event=runtime.lifeEvent;
  if(!event||event.expiresAt<=timestamp)return '';
  return `本轮有一次低概率突发事件机会（私有创作提示）：${event.cue}。从你自己的“偶发行动”中挑一个与当前当地时间、用户自定义背景和已发生事情相容的小行动；不合适就放弃。可以只做事、保持沉默，或自然提一句，不必转移群聊话题。不编造真实紧急事件、其他群友的遭遇或尚未发生的共同经历。只在本轮考虑一次，不重复制造相同插曲。`;
}
