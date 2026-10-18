export const appearanceGroups=[
  {id:'face',label:'五官',fields:[
    ['faceShape','脸型',[['soft','柔和'],['round','圆脸'],['square','方脸'],['oval','鹅蛋脸']]],
    ['eyes','眼睛',[['dot','豆豆眼'],['round','圆眼'],['almond','杏眼'],['sleepy','半眯眼'],['bright','星亮眼'],['smile','笑眼'],['wink','眨眼']]],
    ['eyebrows','眉毛',[['soft','自然眉'],['straight','平眉'],['arched','弯眉'],['thick','浓眉'],['worried','八字眉']]],
    ['nose','鼻子',[['tiny','小鼻子'],['straight','直鼻'],['wide','圆鼻']]],
    ['mouth','嘴型',[['smile','微笑'],['neutral','平静'],['grin','露齿笑'],['small','小嘴'],['open','惊讶'],['pout','抿嘴']]],
    ['cheeks','面颊',[['none','自然'],['blush','腮红'],['freckles','雀斑']]],
    ['facialHair','胡须',[['none','无'],['mustache','小胡子'],['beard','络腮胡'],['goatee','山羊胡'],['stubble','胡茬']]]
  ],colors:[['skin','肤色'],['eyeColor','瞳色']]},
  {id:'hair',label:'发型',fields:[
    ['hairStyle','发型',[[0,'利落短发'],[1,'自然碎发'],[2,'齐肩短发'],[3,'披肩长发'],[4,'蓬松乱发'],[5,'向上翘发'],[6,'马尾'],[7,'侧辫'],[8,'卷发'],[9,'侧分发'],[10,'光头 / 剃发'],[11,'双丸子头']]],
    ['hat','帽子',[['none','无'],['beanie','针织帽'],['cap','鸭舌帽'],['beret','贝雷帽'],['wizard','巫师帽'],['crown','小王冠'],['headband','发带']]],
    ['accessory','眼镜与耳饰',[['none','无'],['glasses','方框眼镜'],['roundGlasses','圆框眼镜'],['sunglasses','墨镜'],['monocle','单片眼镜'],['earring','耳饰']]]
  ],colors:[['hair','发色'],['hatColor','帽子 / 发带']]},
  {id:'outfit',label:'穿搭',fields:[
    ['outfit','上装', [['tshirt','T 恤'],['shirt','衬衫'],['hoodie','连帽衫'],['sweater','针织衫'],['jacket','短夹克'],['coat','长外套'],['suit','西装'],['robe','长袍'],['overalls','背带裤'],['dress','连衣裙'],['armor','轻甲']]],
    ['pattern','花纹',[['plain','纯色'],['stripes','横条纹'],['dots','波点'],['checks','格纹'],['pocket','口袋']]],
    ['neckwear','领饰',[['none','无'],['scarf','围巾'],['tie','领带'],['bowtie','领结'],['necklace','项链']]]
  ],colors:[['shirt','上装'],['accent','搭配色'],['pants','下装'],['shoes','鞋子'],['background','背景']]}
];

const choices=Object.fromEntries(appearanceGroups.flatMap(g=>g.fields.map(([key,,values])=>[key,values.map(([v])=>v)])));
export const appearanceDefaults=Object.freeze({
  skin:'#e7b99a',hair:'#554639',shirt:'#8b83b9',background:'#dcd9ec',
  eyeColor:'#3c3540',accent:'#ddd3aa',pants:'#4c5264',shoes:'#363d4e',hatColor:'#8074a7',
  hairStyle:1,faceShape:'soft',eyes:'dot',eyebrows:'soft',nose:'tiny',mouth:'smile',cheeks:'none',facialHair:'none',
  outfit:'tshirt',pattern:'plain',hat:'none',accessory:'none',neckwear:'none'
});
export function normalizeAppearance(input={},index=0) {
  if(!input||typeof input!=='object')input={};
  const result={...appearanceDefaults,hairStyle:index%6};
  for(const [key] of appearanceGroups.flatMap(g=>g.colors))if(typeof input[key]==='string'&&/^#[a-f\d]{6}$/i.test(input[key]))result[key]=input[key];
  for(const [key,values] of Object.entries(choices)) {
    const value=key==='hairStyle'&&input[key]!==undefined?Number(input[key]):input[key];
    if(values.includes(value))result[key]=value;
  }
  return result;
}

export function randomAppearance(random=Math.random) {
  const pick=list=>list[Math.min(list.length-1,Math.max(0,Math.floor((Number(random())||0)*list.length)))];
  const palette=pick([
    ['#779b98','#d9c28d','#445b62','#dce6e2'],['#8d82b3','#d9cde3','#4b4b67','#e3dff0'],
    ['#be8c75','#efe0bd','#65514b','#eee0d8'],['#6d8caf','#d5dbea','#3c485f','#dce5ee'],
    ['#ac7488','#e4c4cf','#554659','#ebdfe6'],['#8e9e77','#e0d8b0','#4f5b48','#e2e7da']
  ]);
  const result={...appearanceDefaults,shirt:palette[0],accent:palette[1],pants:palette[2],background:palette[3],hatColor:palette[0],
    skin:pick(['#f4d6bb','#e7b99a','#dba582','#c38c69','#a66f50','#80543d']),
    hair:pick(['#292a33','#554639','#7b533e','#a36548','#c4a268','#d5d2c8','#79728f']),
    eyeColor:pick(['#3c3540','#4a574a','#47617c','#71523b','#66528a']),shoes:pick(['#363d4e','#635347','#e0dcd4'])};
  for(const [key,values]of Object.entries(choices))result[key]=pick(values);
  // Most everyday combinations stay uncluttered; hats and beards remain optional.
  result.hat=pick(['none','none','none',result.hat]);
  result.facialHair=pick(['none','none','none',result.facialHair]);
  result.accessory=pick(['none','none',result.accessory]);
  return normalizeAppearance(result);
}

export function presetAppearance(id,input) {
  const clothes={harry:['robe','scarf'],hermione:['robe','none'],ron:['sweater','none'],dumbledore:['robe','none'],wangmiao:['shirt','none'],shi:['jacket','none'],luoji:['shirt','none'],ye:['coat','none'],sherlock:['coat','scarf'],watson:['suit','tie'],elizabeth:['dress','necklace'],darcy:['suit','tie'],littleprince:['coat','scarf'],alice:['dress','none'],santiago:['shirt','none'],sun:['armor','scarf'],zhu:['robe','none'],lin:['robe','necklace'],jia:['robe','none'],zhuge:['robe','none'],guo:['robe','none'],huang:['robe','none'],linghu:['robe','none'],zhang:['robe','none'],nezha:['armor','none'],einstein:['sweater','none'],curie:['coat','none'],newton:['coat','none'],feynman:['shirt','none'],darwin:['coat','none'],tesla:['suit','tie'],turing:['sweater','none'],hawking:['suit','none'],galileo:['robe','none'],sagan:['jacket','none'],luxun:['robe','none'],sushi:['robe','none'],libai:['robe','none'],dufu:['robe','none'],liqingzhao:['robe','none'],tao:['robe','none'],shakespeare:['coat','none'],austen:['dress','none'],woolf:['dress','necklace'],kafka:['suit','tie'],hemingway:['shirt','none'],tagore:['robe','none'],laoshe:['shirt','none'],qiang:['suit','tie'],bingxin:['coat','none']};
  const details={
    tony:{outfit:'armor',shirt:'#a34c48',accent:'#d4b16a',facialHair:'goatee',eyebrows:'arched'},
    steverogers:{outfit:'jacket',shirt:'#73899f',faceShape:'square'},natasha:{outfit:'jacket',shirt:'#454754'},
    thor:{outfit:'armor',facialHair:'beard',accent:'#ac625c'},strange:{outfit:'coat',shirt:'#526c91',neckwear:'scarf',accent:'#af6062',facialHair:'goatee'},
    banner:{outfit:'shirt',mouth:'small'},leia:{outfit:'robe',shirt:'#dedbd4',hairStyle:11},luke:{outfit:'robe',shirt:'#c9bda3'},
    spock:{outfit:'shirt',shirt:'#7296b1',eyebrows:'arched',eyes:'almond'},picard:{outfit:'shirt',shirt:'#9c535b',faceShape:'oval'},
    neo:{outfit:'coat',shirt:'#444650',accessory:'sunglasses'},trinity:{outfit:'jacket',shirt:'#41434b',accessory:'sunglasses'},morpheus:{outfit:'coat',accessory:'sunglasses'},
    ripley:{outfit:'overalls',shirt:'#7d8e7e'},amelie:{outfit:'dress',shirt:'#a35c61',eyes:'bright'},truman:{outfit:'shirt',neckwear:'tie'},
    walle:{outfit:'armor',shirt:'#c1a269',accent:'#727d7e',eyes:'round',hat:'none'},carl:{outfit:'suit',neckwear:'bowtie',accessory:'glasses',faceShape:'square'},
    joy:{outfit:'dress',shirt:'#d7cd77',hair:'#668baf',eyes:'bright'},judy:{outfit:'shirt',shirt:'#758eaa',eyes:'bright'},nick:{outfit:'shirt',shirt:'#9ba977',neckwear:'tie',eyes:'sleepy'},
    moana:{outfit:'dress',shirt:'#c58a71',neckwear:'necklace'},miguel:{outfit:'hoodie',shirt:'#ac5e59'},ted:{outfit:'sweater',facialHair:'mustache'},sheldon:{outfit:'tshirt',pattern:'stripes'},
    bilbo:{outfit:'coat',shirt:'#897953'},gandalf:{outfit:'robe',hat:'wizard',facialHair:'beard',hatColor:'#9997a0'},aragorn:{outfit:'coat',facialHair:'stubble'},
    legolas:{outfit:'coat',shirt:'#81977e',hairStyle:3},jo:{outfit:'dress'},anne:{outfit:'dress',cheeks:'freckles'},quixote:{outfit:'armor',facialHair:'goatee'},
    valjean:{outfit:'coat',facialHair:'beard'},nemo:{outfit:'coat',facialHair:'beard'},scrooge:{outfit:'suit',hat:'beanie'},
    maxwell:{outfit:'suit',facialHair:'beard'},faraday:{outfit:'coat'},noether:{outfit:'dress'},planck:{outfit:'suit',facialHair:'mustache'},bohr:{outfit:'suit'},lovelace:{outfit:'dress'},franklin:{outfit:'coat'},
    wangwei:{outfit:'robe',facialHair:'goatee'},baijuyi:{outfit:'robe',facialHair:'goatee'},xinqiji:{outfit:'robe',facialHair:'goatee'},luyou:{outfit:'robe',facialHair:'beard'},
    zola:{outfit:'suit',accessory:'roundGlasses',facialHair:'beard'},tolstoy:{outfit:'robe',facialHair:'beard'},dickens:{outfit:'suit',facialHair:'beard'},andersen:{outfit:'suit',neckwear:'tie'},
    harry:{accessory:'roundGlasses',accent:'#aa675f'},hermione:{eyebrows:'arched'},ron:{cheeks:'freckles'},
    dumbledore:{facialHair:'beard',hat:'wizard',hatColor:'#8d82b3',accessory:'roundGlasses'},
    shi:{faceShape:'square',eyebrows:'thick',facialHair:'stubble'},sherlock:{hat:'beret',hatColor:'#6e6555',faceShape:'oval'},
    watson:{facialHair:'mustache'},littleprince:{shirt:'#82a08a',accent:'#d9be67'},alice:{shirt:'#83a8c6',accent:'#ede7d7'},
    sun:{hat:'headband',hatColor:'#d1ae57',eyes:'almond'},zhu:{faceShape:'round'},lin:{eyes:'almond',eyebrows:'arched'},
    zhuge:{facialHair:'goatee'},huang:{hairStyle:6,eyes:'bright'},nezha:{hairStyle:11,accent:'#c26c66'},
    einstein:{facialHair:'mustache',hairStyle:4},darwin:{facialHair:'beard'},galileo:{facialHair:'beard'},
    luxun:{facialHair:'mustache',eyebrows:'straight'},sushi:{facialHair:'goatee'},libai:{facialHair:'goatee'},dufu:{facialHair:'beard'},
    liqingzhao:{hairStyle:6},tao:{facialHair:'goatee'},shakespeare:{facialHair:'goatee',hairStyle:9},
    hemingway:{facialHair:'beard'},tagore:{facialHair:'beard'},qiang:{accessory:'roundGlasses'}
  };
  const [outfit,neckwear]=clothes[id]||['tshirt','none'];
  return normalizeAppearance({...input,outfit,neckwear,...details[id]});
}
