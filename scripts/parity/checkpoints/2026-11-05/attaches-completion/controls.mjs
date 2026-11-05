import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { verify } from './review.mjs'
const raw=JSON.parse(gunzipSync(readFileSync(new URL('comparison.json.gz',import.meta.url))))
const mutations=[
 r=>{r.headBefore='0'.repeat(40)},r=>{r.headAfter='0'.repeat(40)},r=>{r.results.pop()},
 r=>{r.results.at(-1).policyEnforced=false},r=>{r.results.at(-1).cases.pop()},
 r=>{r.results.at(-1).cases[0].error='lost download'},r=>{r.results.at(-1).cases[0].events[0].trusted=false},
 r=>{r.results.at(-1).cases[0].observations.find(o=>o.property==='completed').actual.bytes[0]=9},
 r=>{r.results.at(-1).cases[0].observations.find(o=>o.property==='completed').expected.bytes[0]=9},
 r=>{r.results.at(-1).cases[6].observations.find(o=>o.property==='entries').actual.reverse()},
 r=>{r.results.at(-1).cases[8].observations.find(o=>o.property==='allSignals').actual[0]=false},
 r=>{r.results.at(-1).cases[8].phases=r.results.at(-1).cases[8].phases.filter(x=>x!=='retire')},
 r=>{r.results[0].cases[8].observations.find(o=>o.property==='oldControlRequests').status='PASS'},
 r=>{r.results.at(-1).pageErrors.push('unhandled')},
]
for(const mutate of mutations){const r=structuredClone(raw);mutate(r);assert.throws(()=>verify(r,false))}
console.log(JSON.stringify({rejectedCorruptions:mutations.length}))
