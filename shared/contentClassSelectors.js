// @ts-check
/** Rewrite class selectors admitted by native CSSOM, retaining token grammar.
 * @param {string} selector @param {string} prefix @returns {string}
 */
export function rewriteContentClassSelectors(selector, prefix) {
  let index=0,result=''
  const space=character=>!!character&&/[\t\n\f\r ]/.test(character)
  const nameCharacter=character=>!!character&&/[a-z0-9_-]|[^\x00-\x7f]/i.test(character)
  const escape=start=>{
    let end=start+1
    const hex=/^[a-f0-9]{1,6}/i.exec(selector.slice(end))?.[0]
    if(!hex)return{end:Math.min(end+1,selector.length),value:selector[end]??''}
    end+=hex.length
    if(space(selector[end]))end+=selector[end]==='\r'&&selector[end+1]==='\n'?2:1
    const code=parseInt(hex,16)
    return{end,value:String.fromCodePoint(!code||code>0x10ffff||code>=0xd800&&code<=0xdfff?0xfffd:code)}
  }
  const name=start=>{
    let end=start,value=''
    while(end<selector.length){
      if(nameCharacter(selector[end]))value+=selector[end++]
      else if(selector[end]==='\\'){
        const escaped=escape(end);value+=escaped.value;end=escaped.end
      }else break
    }
    return{end,value}
  }
  const quotedEnd=start=>{
    const quote=selector[start];let end=start+1
    while(end<selector.length){
      if(selector[end]===quote)return end+1
      if(selector[end]==='\\')end=escape(end).end
      else end++
    }
    return end
  }
  const commentEnd=start=>{const end=selector.indexOf('*/',start+2);return end<0?selector.length:end+2}
  const spacing=start=>{
    let end=start
    while(end<selector.length){
      if(space(selector[end]))end++
      else if(selector.slice(end,end+2)==='/*')end=commentEnd(end)
      else break
    }
    return end
  }
  while(index<selector.length){
    const start=index,character=selector[index]
    if(selector.slice(index,index+2)==='/*'){index=commentEnd(index);result+=selector.slice(start,index);continue}
    if(character==='"'||character==="'"){index=quotedEnd(index);result+=selector.slice(start,index);continue}
    if(character==='['){
      const head=spacing(index+1),explicitNull=selector[head]==='|',attribute=name(head+(explicitNull?1:0))
      const isClass=attribute.value.toLowerCase()==='class'
        &&!(selector[attribute.end]==='|'&&selector[attribute.end+1]!=='=')
      let end=attribute.end
      while(end<selector.length&&selector[end]!==']'){
        if(selector[end]==='"'||selector[end]==="'")end=quotedEnd(end)
        else if(selector.slice(end,end+2)==='/*')end=commentEnd(end)
        else if(selector[end]==='\\')end=escape(end).end
        else end++
      }
      index=Math.min(end+1,selector.length)
      result+=isClass?selector.slice(start,head)+prefix+'|class'+selector.slice(attribute.end,index):selector.slice(start,index)
      continue
    }
    if(character==='.'&&(nameCharacter(selector[index+1])||selector[index+1]==='\\')){
      const token=name(index+1);index=token.end
      result+='['+prefix+'|class~='+selector.slice(start+1,index)+']';continue
    }
    if(character==='\\'){index=escape(index).end;result+=selector.slice(start,index);continue}
    result+=character;index++
  }
  return result
}
