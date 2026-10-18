import { normalizeAppearance } from './appearance.js';

// Layered native pixel art. All values pass through the shared server/client schema.
export function avatar(input={},size=64,full=false) {
  const a=normalizeAppearance(input),h=full?40:32;
  size=Number.isFinite(Number(size))?Math.min(1024,Math.max(1,Number(size))):64;
  const r=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const skin=a.skin,hair=a.hair,shirt=a.shirt,accent=a.accent;
  let p=r(0,0,32,h,a.background);
  const long=[2,3,6,7,8,11].includes(a.hairStyle);
  if(long)p+=r(7,9,18,a.hairStyle===3?20:16,hair);
  if(a.hairStyle===6)p+=r(23,8,4,16,hair)+r(24,12,4,10,hair);
  if(a.hairStyle===7)p+=r(24,12,3,17,hair)+r(23,19,5,2,accent)+r(23,26,5,2,accent);
  // Legs and shoes are genuinely separate objects in full-body previews.
  p+=r(10,31,5,7,a.pants)+r(18,31,5,7,a.pants)+r(9,37,7,3,a.shoes)+r(17,37,7,3,a.shoes);
  const extended=['coat','robe','dress'].includes(a.outfit),bottom=extended?36:32;
  p+=r(8,24,17,bottom-24,shirt)+r(5,25,4,8,shirt)+r(24,25,4,8,shirt)+r(5,32,4,3,skin)+r(24,32,4,3,skin);
  p+=r(14,21,5,5,skin);
  if(a.outfit==='tshirt')p+=r(5,29,4,3,skin)+r(24,29,4,3,skin);
  if(a.outfit==='shirt')p+=r(11,24,4,3,accent)+r(18,24,4,3,accent)+r(16,27,1,5,accent)+r(17,28,1,1,'#f2f0e5');
  if(a.outfit==='hoodie')p+=r(10,23,4,4,accent)+r(19,23,4,4,accent)+r(13,26,1,4,accent)+r(20,26,1,4,accent)+r(12,30,10,2,accent);
  if(a.outfit==='sweater')p+=r(11,24,11,2,accent)+r(9,30,15,2,accent);
  if(['jacket','coat','suit'].includes(a.outfit))p+=r(14,24,6,bottom-24,accent)+r(11,24,3,4,shirt)+r(20,24,3,4,shirt)+r(11,29,2,2,accent)+r(22,29,2,2,accent);
  if(a.outfit==='suit')p+=r(14,24,2,2,'#f1eee5')+r(18,24,2,2,'#f1eee5')+r(17,28,1,1,shirt)+r(17,30,1,1,shirt);
  if(a.outfit==='robe')p+=r(11,24,3,3,accent)+r(14,27,3,3,accent)+r(17,24,3,3,accent)+r(17,28,2,8,accent)+r(8,32,17,2,accent);
  if(a.outfit==='overalls')p+=r(11,24,2,8,a.pants)+r(21,24,2,8,a.pants)+r(10,28,14,5,a.pants)+r(12,28,1,1,accent)+r(21,28,1,1,accent)+r(14,29,6,2,shirt);
  if(a.outfit==='dress')p+=r(10,24,4,3,accent)+r(20,24,3,3,accent)+r(8,29,17,2,accent)+r(6,33,21,3,shirt)+r(7,35,19,1,accent);
  if(a.outfit==='armor')p+=r(9,25,15,2,accent)+r(10,28,13,2,accent)+r(8,31,17,2,accent)+r(6,25,3,4,accent)+r(25,25,2,4,accent)+r(15,27,3,4,'#eff2ed');
  // Patterns remain visible inside a small portrait, rather than only below it.
  if(a.pattern==='stripes')for(const y of [27,30,33])if(y<bottom)p+=r(9,y,15,1,accent);
  if(a.pattern==='dots')for(const [x,y]of [[11,27],[17,29],[22,27],[12,31],[22,32]])if(y<bottom)p+=r(x,y,1,1,accent);
  if(a.pattern==='checks'){for(const x of [11,17,22])p+=r(x,26,1,bottom-26,accent);for(const y of [27,31,34])if(y<bottom)p+=r(9,y,15,1,accent);}
  if(a.pattern==='pocket')p+=r(20,27,4,4,accent)+r(21,28,2,2,shirt);
  if(a.neckwear==='scarf')p+=r(10,23,13,3,accent)+r(20,25,3,7,accent)+r(19,31,4,1,accent);
  if(a.neckwear==='tie')p+=r(16,24,2,2,hair)+r(15,26,4,5,hair)+r(16,26,2,4,accent)+r(16,31,2,1,hair);
  if(a.neckwear==='bowtie')p+=r(12,24,4,3,accent)+r(18,24,4,3,accent)+r(16,25,2,1,shirt);
  if(a.neckwear==='necklace')p+=r(12,25,1,2,accent)+r(13,27,7,1,accent)+r(20,25,1,2,accent)+r(16,28,2,2,accent);
  const faces={soft:[[10,7,13,14],[9,11,15,8],[11,20,11,2]],round:[[11,6,11,1],[9,7,15,13],[8,10,17,8],[11,20,11,3]],square:[[9,7,15,15],[10,22,13,1]],oval:[[11,6,11,2],[10,8,13,12],[12,20,9,3]]};
  for(const [x,y,w,h]of faces[a.faceShape])p+=r(x,y,w,h,skin);
  p+=r(8,13,2,5,skin)+r(23,13,2,5,skin);
  const brow=a.eyebrows==='thick'?2:1;
  if(a.eyebrows==='arched')p+=r(11,11,3,1,hair)+r(12,10,2,1,hair)+r(19,10,2,1,hair)+r(20,11,2,1,hair);
  else if(a.eyebrows==='worried')p+=r(11,11,2,1,hair)+r(13,10,2,1,hair)+r(19,10,2,1,hair)+r(21,11,2,1,hair);
  else if(a.eyebrows==='soft')p+=r(11,11,3,1,hair)+r(14,12,1,1,hair)+r(19,12,1,1,hair)+r(20,11,3,1,hair);
  else p+=r(11,11,4,brow,hair)+r(19,11,4,brow,hair);
  for(const [x,index]of [[12,0],[20,1]]){
    if(a.eyes==='smile'||a.eyes==='wink'&&index===1)p+=r(x-1,14,1,1,a.eyeColor)+r(x,13,2,1,a.eyeColor)+r(x+2,14,1,1,a.eyeColor);
    else if(a.eyes==='sleepy')p+=r(x-1,14,4,1,a.eyeColor)+r(x+1,15,1,1,a.eyeColor);
    else if(a.eyes==='almond')p+=r(x-1,14,4,1,'#f7eee2')+r(x,14,2,2,a.eyeColor);
    else if(a.eyes==='round'||a.eyes==='bright')p+=r(x-1,13,4,4,'#f7eee2')+r(x,13,2,3,a.eyeColor)+r(x,13,1,1,'#ffffff');
    else p+=r(x,14,2,2,a.eyeColor)+r(x,14,1,1,'#ffffff88');
    if(a.eyes==='bright')p+=r(x+2,15,1,1,'#ffffff');
  }
  const shade='#b77f68';
  if(a.nose==='tiny')p+=r(16,17,2,1,shade);
  if(a.nose==='straight')p+=r(16,15,1,3,shade)+r(16,18,2,1,shade);
  if(a.nose==='wide')p+=r(15,17,4,2,shade);
  if(a.cheeks==='blush')p+=r(10,17,3,1,'#d88d87')+r(21,17,3,1,'#d88d87');
  if(a.cheeks==='freckles')p+=r(10,17,1,1,shade)+r(12,18,1,1,shade)+r(21,18,1,1,shade)+r(23,17,1,1,shade);
  if(a.facialHair==='beard')p+=r(10,18,2,5,hair)+r(22,18,2,5,hair)+r(11,21,12,3,hair)+r(13,24,8,2,hair);
  if(a.facialHair==='mustache'||a.facialHair==='beard')p+=r(13,18,3,2,hair)+r(18,18,3,2,hair);
  if(a.facialHair==='goatee')p+=r(15,21,5,3,hair)+r(16,24,3,1,hair);
  if(a.facialHair==='stubble')for(const [x,y]of [[11,20],[13,21],[16,22],[20,21],[22,20]])p+=r(x,y,1,1,hair);
  const lips='#a26764';
  if(a.mouth==='smile')p+=r(14,20,1,1,lips)+r(15,21,4,1,lips)+r(19,20,1,1,lips);
  if(a.mouth==='neutral')p+=r(14,21,6,1,lips);
  if(a.mouth==='grin')p+=r(13,20,8,3,lips)+r(14,20,6,1,'#fff5e7');
  if(a.mouth==='small')p+=r(16,21,2,1,lips);
  if(a.mouth==='open')p+=r(15,20,4,3,lips)+r(16,21,2,1,'#513c43');
  if(a.mouth==='pout')p+=r(15,20,4,1,lips)+r(16,21,2,1,lips);
  // Hair fringes, hats and eyewear are the upper layers.
  const hs=a.hairStyle;
  if(hs!==10)p+=r(10,5,13,3,hair)+r(8,8,3,5,hair)+r(23,8,2,5,hair);
  if(hs===0)p+=r(10,7,13,2,hair);
  if(hs===1)p+=r(12,4,7,2,hair)+r(10,7,5,4,hair)+r(20,7,3,3,hair);
  if(hs===2)p+=r(7,10,3,13,hair)+r(23,10,3,13,hair)+r(10,7,13,3,hair);
  if(hs===3)p+=r(6,10,4,18,hair)+r(23,10,4,18,hair)+r(10,7,8,4,hair);
  if(hs===4)p+=r(7,4,5,4,hair)+r(12,3,9,3,hair)+r(22,4,4,4,hair)+r(5,8,5,4,hair)+r(24,8,4,4,hair);
  if(hs===5)p+=r(9,4,4,4,hair)+r(14,2,4,5,hair)+r(20,3,4,5,hair)+r(25,5,2,4,hair);
  if(hs===6)p+=r(11,6,8,3,hair)+r(22,7,4,2,accent);
  if(hs===7)p+=r(10,6,11,3,hair);
  if(hs===8)p+=r(6,7,4,7,hair)+r(23,6,5,8,hair)+r(8,4,5,4,hair)+r(17,3,6,4,hair)+r(6,16,4,6,hair)+r(24,15,4,7,hair);
  if(hs===9)p+=r(10,6,10,4,hair)+r(18,7,4,2,hair);
  if(hs===11)p+=r(4,4,7,7,hair)+r(23,4,7,7,hair)+r(8,10,2,2,accent)+r(24,10,2,2,accent);
  const hc=a.hatColor;
  if(a.hat==='beanie')p+=r(8,4,17,5,hc)+r(7,8,19,2,accent)+r(14,2,5,2,hc);
  if(a.hat==='cap')p+=r(9,4,15,5,hc)+r(8,8,21,2,hc)+r(10,5,3,2,accent);
  if(a.hat==='beret')p+=r(7,5,20,4,hc)+r(11,3,14,3,hc)+r(17,2,2,2,accent);
  if(a.hat==='wizard')p+=r(15,0,4,3,hc)+r(12,3,10,3,hc)+r(10,6,14,3,hc)+r(6,9,22,2,hc)+r(17,4,2,2,accent);
  if(a.hat==='crown')p+=r(10,5,15,3,hc)+r(10,2,3,4,hc)+r(16,1,3,5,hc)+r(22,2,3,4,hc)+r(16,6,2,1,accent);
  if(a.hat==='headband')p+=r(8,9,17,2,hc)+r(24,10,4,2,hc)+r(26,12,2,4,hc);
  if(['glasses','roundGlasses','sunglasses'].includes(a.accessory)){
    const frame=a.accessory==='sunglasses'?'#303645':'#4b4e60';
    for(const x of [10,19]){
      if(a.accessory==='roundGlasses')p+=r(x+1,12,4,1,frame)+r(x,13,1,4,frame)+r(x+5,13,1,4,frame)+r(x+1,17,4,1,frame);
      else p+=r(x,12,7,1,frame)+r(x,13,1,4,frame)+r(x+6,13,1,4,frame)+r(x,17,7,1,frame);
      if(a.accessory==='sunglasses')p+=r(x+1,13,5,4,frame)+r(x+2,13,2,1,'#9ca6b0');
    }p+=r(16,13,3,1,frame);
  }
  if(a.accessory==='monocle')p+=r(19,12,6,1,accent)+r(19,13,1,5,accent)+r(24,13,1,5,accent)+r(19,18,6,1,accent)+r(25,18,1,6,accent);
  if(a.accessory==='earring')p+=r(24,17,2,4,accent)+r(24,21,2,1,accent);
  return `<svg class="pixel-avatar" width="${size}" height="${full?Math.round(size*40/32):size}" viewBox="0 0 32 ${h}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">${p}</svg>`;
}
