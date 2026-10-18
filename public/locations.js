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
  ['oslo','挪威 · 奥斯陆','Europe/Oslo'],
  ['mexico','墨西哥 · 墨西哥城','America/Mexico_City'],
  ['boston','美国 · 波士顿','America/New_York'],
  ['charlottetown','加拿大 · 夏洛特敦','America/Halifax'],
  ['madrid','西班牙 · 马德里','Europe/Madrid'],
  ['berlin','德国 · 柏林','Europe/Berlin'],
  ['copenhagen','丹麦 · 哥本哈根','Europe/Copenhagen'],
  ['moscow','俄罗斯 · 莫斯科','Europe/Moscow'],
  ['xian','中国 · 西安','Asia/Shanghai'],
  ['luoyang','中国 · 洛阳','Asia/Shanghai'],
  ['shangrao','中国 · 上饶','Asia/Shanghai'],
  ['shaoxing','中国 · 绍兴','Asia/Shanghai'],
  ['auckland','新西兰 · 奥克兰','Pacific/Auckland']
].map(([id,name,timezone])=>({id,name,timezone}));

const rolePlaces = {
  "tony":"pasadena","steverogers":"newyork","natasha":"newyork","thor":"oslo","strange":"newyork","banner":"newyork","leia":"london","luke":"london","spock":"london","picard":"paris","neo":"newyork","trinity":"newyork","morpheus":"newyork","ripley":"london","amelie":"paris","truman":"newyork","walle":"pasadena","carl":"pasadena","joy":"pasadena","judy":"newyork","nick":"newyork","moana":"auckland","miguel":"mexico","ted":"london","sheldon":"pasadena","bilbo":"london","gandalf":"london","aragorn":"london","legolas":"london","jo":"boston","anne":"charlottetown","quixote":"madrid","valjean":"paris","nemo":"paris","scrooge":"london","maxwell":"cambridge","faraday":"london","noether":"princeton","planck":"berlin","bohr":"copenhagen","lovelace":"london","franklin":"london","wangwei":"xian","baijuyi":"luoyang","xinqiji":"shangrao","luyou":"shaoxing","zola":"paris","tolstoy":"moscow","dickens":"london","andersen":"copenhagen",
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
