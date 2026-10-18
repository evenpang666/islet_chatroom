const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export function clipText(value,max) {
  if(value.length<=max)return value;
  let result='';for(const {segment} of segmenter.segment(value)){if(result.length+segment.length>max)break;result+=segment;}return result;
}
export const firstGrapheme=value=>segmenter.segment(value)[Symbol.iterator]().next().value?.segment||'';
export const textLength=value=>[...segmenter.segment(value)].length;
