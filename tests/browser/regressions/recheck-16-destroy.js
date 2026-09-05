import { test, make, equal } from './harness.js'

export function register() {
  test('destroy publishes a non-ready editor before DESTROYED callbacks',()=>{
   const e=make();let observed;e.events.on('editor:destroyed',()=>{observed=e.isReady});e.destroy();equal(observed,false);
  })
  
  test('destroy remains idempotent inside a destroyed-event observer',()=>{
   const e=make();let count=0;e.events.on('editor:destroyed',()=>{count++;if(count===1)e.destroy()});e.destroy();equal(count,1);
  })
}
