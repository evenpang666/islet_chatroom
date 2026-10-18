// Editable story settings; these places describe the role-play, not a live person's location.
export const locations = [
  ['shanghai','中国 · 上海','Asia/Shanghai'],
  ['beijing','中国 · 北京','Asia/Shanghai'],
  ['hangzhou','中国 · 杭州','Asia/Shanghai'],
  ['chengdu','中国 · 成都','Asia/Shanghai'],
  ['london','英国 · 伦敦','Europe/London'],
  ['scotland','英国 · 苏格兰高地','Europe/London'],
  ['cambridge','英国 · 剑桥','Europe/London'],
  ['manchester','英国 · 曼彻斯特','Europe/London'],
  ['paris','法国 · 巴黎','Europe/Paris'],
  ['zurich','瑞士 · 苏黎世','Europe/Zurich'],
  ['florence','意大利 · 佛罗伦萨','Europe/Rome'],
  ['princeton','美国 · 普林斯顿','America/New_York'],
  ['newyork','美国 · 纽约','America/New_York'],
  ['ithaca','美国 · 伊萨卡','America/New_York'],
  ['pasadena','美国 · 帕萨迪纳','America/Los_Angeles'],
  ['havana','古巴 · 哈瓦那','America/Havana'],
  ['kolkata','印度 · 加尔各答','Asia/Kolkata'],
  ['prague','捷克 · 布拉格','Europe/Prague'],
  ['tokyo','日本 · 东京','Asia/Tokyo'],
  ['sydney','澳大利亚 · 悉尼','Australia/Sydney'],
  ['auckland','新西兰 · 奥克兰','Pacific/Auckland']
].map(([id,name,timezone])=>({id,name,timezone}));

const rolePlaces = {
  harry:'scotland',hermione:'scotland',ron:'scotland',dumbledore:'scotland',
  sherlock:'london',watson:'london',elizabeth:'london',darcy:'london',alice:'london',
  littleprince:'paris',santiago:'havana',einstein:'princeton',curie:'paris',newton:'cambridge',
  feynman:'pasadena',darwin:'london',tesla:'newyork',turing:'manchester',hawking:'cambridge',
  galileo:'florence',sagan:'ithaca',luxun:'shanghai',sushi:'hangzhou',libai:'chengdu',
  dufu:'chengdu',liqingzhao:'hangzhou',shakespeare:'london',austen:'london',woolf:'london',
  kafka:'prague',hemingway:'havana',tagore:'kolkata',laoshe:'beijing',qiang:'beijing',bingxin:'beijing'
};
export function defaultLocation(presetId) {
  const place=locations.find(p=>p.id===(rolePlaces[presetId]||'beijing'));
  return {location:place.name,timezone:place.timezone};
}
