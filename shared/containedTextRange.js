// @ts-check

/** Convert a browser range wholly inside a label to its UTF-16 text offsets.
 * @param {HTMLElement} container
 * @param {Range | StaticRange | null | undefined} source
 * @returns {{start:number,end:number} | null}
 */
export function containedTextRange(container,source){
  if(!source||!container.contains(source.startContainer)||!container.contains(source.endContainer))return null
  const prefix=container.ownerDocument.createRange()
  prefix.selectNodeContents(container)
  try{
    prefix.setEnd(source.startContainer,source.startOffset)
    const start=prefix.toString().length
    prefix.setEnd(source.endContainer,source.endOffset)
    const end=prefix.toString().length
    return end>start?{start,end}:null
  }catch{return null}
}
