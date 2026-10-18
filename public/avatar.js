// Native pixel art: each portrait is editable, deterministic, and dependency-free.
export function avatar(a={}, size=64, full=false) {
  const safe=(v,f)=>/^#[a-f\d]{6}$/i.test(v||'')?v:f;
  const skin=safe(a.skin,'#e7b99a'),hair=safe(a.hair,'#554639'),shirt=safe(a.shirt,'#8b83b9'),bg=safe(a.background,'#dcd9ec');
  const style=Number(a.hairStyle)||0;
  const rect=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  let p=rect(0,0,24,full?32:24,bg);
  if(full) p+=rect(7,27,4,4,'#4c5264')+rect(13,27,4,4,'#4c5264')+rect(6,30,5,2,'#363d4e')+rect(13,30,5,2,'#363d4e');
  p+=rect(5,18,14,10,shirt)+rect(3,20,3,6,shirt)+rect(18,20,3,6,shirt)+rect(3,25,3,2,skin)+rect(18,25,3,2,skin)+rect(10,16,4,4,skin)+rect(7,6,10,11,skin)+rect(6,9,12,6,skin);
  p+=rect(7,4,10,4,hair)+rect(6,6,2,5,hair)+rect(16,6,2,5,hair);
  if(style===0) p+=rect(7,4,10,2,hair)+rect(8,6,8,2,hair);
  if(style===1) p+=rect(9,3,6,2,hair)+rect(7,5,4,4,hair)+rect(13,5,4,3,hair);
  if(style===2) p+=rect(5,6,2,14,hair)+rect(17,6,2,14,hair)+rect(7,5,6,3,hair);
  if(style===3) p+=rect(5,6,3,17,hair)+rect(16,6,3,17,hair)+rect(7,5,8,3,hair)+rect(13,7,3,2,hair);
  if(style===4) p+=rect(4,5,4,3,hair)+rect(16,5,4,3,hair)+rect(3,8,4,3,hair)+rect(17,8,4,3,hair)+rect(7,15,2,4,hair)+rect(15,15,2,4,hair)+rect(8,17,8,3,hair);
  if(style===5) p+=rect(5,5,3,3,hair)+rect(8,3,3,3,hair)+rect(12,2,2,4,hair)+rect(16,4,3,4,hair);
  p+=rect(9,10,2,2,'#3c3540')+rect(14,10,2,2,'#3c3540')+rect(11,14,3,1,'#ad7569');
  if(a.accessory==='glasses') p+=rect(8,9,5,1,'#414553')+rect(13,9,5,1,'#414553')+rect(8,10,1,3,'#414553')+rect(12,10,2,3,'#414553')+rect(17,10,1,3,'#414553')+rect(8,12,5,1,'#414553')+rect(13,12,5,1,'#414553');
  if(a.accessory==='earring') p+=rect(17,14,1,3,'#e6c569');
  p+=rect(10,20,4,1,'#ffffff66')+rect(11,22,2,2,'#ffffff44');
  return `<svg class="pixel-avatar" width="${size}" height="${full?Math.round(size*32/24):size}" viewBox="0 0 24 ${full?32:24}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">${p}</svg>`;
}
