import {normalizeAppearance} from './appearance.js';
export const genders=['unspecified','female','male','nonbinary'];
export const genderLabels={unspecified:'未指定',female:'女性',male:'男性',nonbinary:'非二元'};
export const normalizeGender=value=>genders.includes(value)?value:'unspecified';
export function genderAppearance(gender,input={}) {
  const changes={female:{hairStyle:3,faceShape:'oval',outfit:'dress',facialHair:'none'},male:{hairStyle:1,faceShape:'square',outfit:'shirt',facialHair:'none'},nonbinary:{hairStyle:2,faceShape:'soft',outfit:'jacket',facialHair:'none'},unspecified:{hairStyle:1,faceShape:'soft',outfit:'tshirt',facialHair:'none'}};
  return normalizeAppearance({...input,...changes[normalizeGender(gender)]});
}
export function genderPersonality(gender){return {female:'以女性身份生活，有独立的判断与边界；温和、好奇，也会明确表达不同意见。',male:'以男性身份生活，有独立的判断与边界；温和、好奇，也会明确表达不同意见。',nonbinary:'以非二元身份生活，有独立的判断与边界；温和、好奇，也会明确表达不同意见。',unspecified:'温和、好奇，有自己的观点'}[normalizeGender(gender)];}
