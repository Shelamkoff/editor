import assert from 'node:assert/strict'
import {readReports,verify} from './review.mjs'
const original=readReports()
const current=(r,g='media-sources')=>r[g].results.find(x=>x.source==='candidate')
const change=(r,g,id,phase,property,value,both=false)=>{const o=current(r,g).cases.find(c=>c.id===id).observations.find(o=>o.phase===phase&&o.property===property);o.actual=value;if(both)o.expected=value}
const mutations=[
 r=>{r['media-sources'].fixtureSha256='0'.repeat(64)},
 r=>{r['media-sources'].runnerSha256='0'.repeat(64)},
 r=>{r['gallery-layouts'].serverErrors.push('source mismatch')},
 r=>{r['media-sources'].headBefore='0'.repeat(40)},
 r=>{r['media-sources'].headAfter='0'.repeat(40)},
 r=>{r['media-sources'].results.pop()},
 r=>{r['media-sources'].results.at(-1).policyEnforced=false},
 r=>{current(r).cases.pop()},
 r=>{current(r).cases[0].error='missing source action'},
 r=>{current(r).cases[0].observations.find(o=>o.phase==='trigger'&&o.property==='trusted').actual=false},
 r=>change(r,'media-sources','gallery/cancel-upload/4','cancel','signal',false,true),
 r=>change(r,'media-sources','gallery/partial/2','settle','allMembers',[{url:'lost',caption:''}],true),
 r=>change(r,'media-sources','gallery/upload/1','settle','inputFiles',[],true),
 r=>change(r,'media-sources','carousel/video-local/12','settle','blobPrefix',false,true),
 r=>change(r,'media-sources','carousel/video-local/12','dispose','blobReleased',false,true),
 r=>change(r,'media-sources','person/crop-remote/16','avatar','croppedFile',{name:'photo.png',type:'image/png',nonempty:true},true),
 r=>change(r,'media-sources','person/crop-cancel/17','crop','history',true,true),
 r=>change(r,'gallery-layouts','5b','width-320','visibleArea',false,true),
 r=>{current(r,'gallery-layouts').cases.find(c=>c.id==='5b').geometry[0].items[1].width=0},
 r=>change(r,'gallery-layouts','1','reinsert','sameItems',false,true),
 r=>change(r,'gallery-layouts','masonry','update','count',1,true),
 r=>change(r,'carousel-controls','editor-controls','playback','played',false,true),
 r=>change(r,'carousel-controls','output-loop','controls','wrap',2,true),
 r=>change(r,'carousel-controls','output-disabled','disabled','controls',3,true),
 r=>change(r,'carousel-controls','output-controls','controls','paginationSelected',0,true),
 r=>change(r,'person-links','custom-social','edit','customIcon',false,true),
 r=>change(r,'person-links','custom-social','output','names',['Ada'],true),
 r=>change(r,'person-links','custom-social','navigation','destination',{url:'http://127.0.0.1/not-the-author',title:'Author destination',text:'Author destination'},true),
 r=>{current(r,'person-links').pageErrors.push('unhandled rejection')},
]
for(const mutate of mutations){const r=structuredClone(original);mutate(r);assert.throws(()=>verify(r,false))}
console.log(JSON.stringify({rejectedCorruptions:mutations.length}))
