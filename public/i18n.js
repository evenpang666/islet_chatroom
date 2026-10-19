import {english} from './translations.js';
let current='zh';try{if(globalThis.localStorage?.getItem('islet-language')==='en')current='en';}catch{}
export const language=()=>current;
export function setLanguage(value){current=value==='en'?'en':'zh';try{globalThis.localStorage?.setItem('islet-language',current);}catch{}if(globalThis.document){document.documentElement.lang=current==='en'?'en':'zh-CN';document.title=current==='en'?'Islet · Let conversations grow':'浮岛 Islet · 让相遇发生';}}
const entries=Object.entries(english).sort((a,b)=>b[0].length-a[0].length);
const pattern=new RegExp(entries.map(([key])=>key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
export function t(value){if(current!=='en'||typeof value!=='string')return value;if(english[value])return english[value];const key=value.trim();if(english[key])return value.replace(key,english[key]);return value.startsWith('<')?value.replace(pattern,key=>english[key]):value;}
// Translate source-owned template fragments before interpolation. Never run
// replacement against a rendered DOM or a message, name, profile or draft.
export function h(parts,...values){return parts.map((part,i)=>(current==='en'?part.replace(pattern,key=>english[key]):part)+(i<values.length?values[i]:'')).join('');}
setLanguage(current);
