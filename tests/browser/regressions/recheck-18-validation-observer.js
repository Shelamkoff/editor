import { test, make, para, equal } from './harness.js'
import { Paragraph } from '../../../plugins/index.js'

export function register() {
  test('validation diagnostics callback cannot invalidate otherwise-preservable content',()=>{
   class Invalid extends Paragraph{validate(){return false}}
   let ready=false;let e;try{e=make([para('a','Preserve')],{plugins:[new Invalid()],validationMode:'preserve',onValidationError(){throw new Error('diagnostic consumer failed')}});ready=true}catch{}
   equal(ready,true,'a diagnostic callback must not replace preserve policy with failure');
  })
}
