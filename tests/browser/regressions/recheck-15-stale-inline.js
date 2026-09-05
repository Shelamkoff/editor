import { test, make, para, equal } from './harness.js'

export function register() {
  const inline = { w_missing: { type: 'missing', data: { id: '42', name: 'Anna' } } }
  
  test('discarded inline callbacks cannot mutate a replacement with the same block ID',()=>{
   let target,ctx;
   const widget={type:'tracked',title:'Tracked',icon:'',createWidget(data,id){const n=document.createElement('span');n.dataset.inlinePlugin='tracked';n.dataset.id=id;n.textContent='Widget';return n},hydrate(n,c){target=n;ctx=c},getData(){return {id:'x'}}};
   const e=make([para('a','{{w}}',{inline:{w:{type:'tracked',data:{id:'x'}}}})],{inlinePlugins:[widget]});const old=target;e.render({version:'1',blocks:[para('a','Replacement')]});let called=false;ctx.mutate(old,()=>{called=true});equal(called,false);
  })
}
