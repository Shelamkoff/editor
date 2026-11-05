import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const candidate='e88992ee55b17e635be38a7ef715c076f6a8ac64'
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const sha=x=>createHash('sha256').update(x).digest('hex')
const slots={'1':1,'2':2,'3a':3,'3b':3,'3c':3,'4a':4,'4b':4,'4c':4,'5a':5,'5b':5,'5c':5,'6a':6,'6b':6,'6c':6,triptych:3,'poly-5':5,'poly-3arch':3,'poly-5flat':5,'poly-3steps':3,auto:6,masonry:7}
export function verify(reports,gitFiles=true){
 const totals={executions:0,observations:0,modules:0}
 for(const [group,d] of Object.entries(reports)){
  assert.equal(d.headBefore,candidate);assert.equal(d.headAfter,candidate);assert.deepEqual(d.serverErrors,[])
  assert.equal(d.candidatePass,true)
  assert.equal(d.fixtureSha256,sha(readFileSync(new URL(group+'/fixture.js',import.meta.url))))
  assert.equal(d.runnerSha256,sha(readFileSync(new URL(group+'/runner.mjs',import.meta.url))))
  if(gitFiles)assert.equal(d.packageLockSha256,sha(execFileSync('git',['show',candidate+':package-lock.json'])))
  const rows=d.results.filter(r=>r.source==='candidate');assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.trustedPolicy),[false,true])
  const expectedIds=group==='gallery-layouts'?Object.keys(slots):group==='carousel-controls'?['editor-controls','output-controls','output-loop','output-disabled','output-autoplay']:group==='person-links'?['custom-social']:[...['local','upload','partial','action','cancel-upload','cancel-action'].map((m,i)=>`gallery/${m}/${i}`),...['local','upload','partial','action','cancel-upload','cancel-action'].map((m,i)=>`carousel/${m}/${i+6}`),'carousel/video-local/12','carousel/video-upload/13','person/local/14','person/remote/15','person/crop-remote/16','person/crop-cancel/17']
  for(const r of rows){
   assert.equal(r.policyEnforced,r.trustedPolicy)
   for(const key of ['pageErrors','inputErrors','externalRequests','unavailable'])assert.deepEqual(r[key],[])
   assert.deepEqual(r.cases.map(c=>c.id),expectedIds)
   for(const c of r.cases){
    assert.ok(!c.error,c.error);assert.deepEqual(c.unsupported,[]);assert.ok(c.phases.includes('dispose'))
    assert.ok(c.observations.length>0)
    for(const o of c.observations){assert.deepEqual(o.actual,o.expected);assert.equal(o.status,'PASS')}
    for(const e of c.events.filter(e=>e.kind==='click'))assert.equal(e.trusted,true)
    const get=(phase,property)=>{const os=c.observations.filter(o=>o.phase===phase&&o.property===property);assert.equal(os.length,1,group+'/'+c.id+'/'+phase+'/'+property);return os[0]}
    const equal=(phase,property,value)=>{const o=get(phase,property);assert.deepEqual(o.actual,value);assert.deepEqual(o.expected,value)}
    if(group==='gallery-layouts'){
     assert.deepEqual(c.phases,['render','width-320','width-600','reinsert','update','dispose'])
     assert.equal(c.geometry.length,4)
     for(const phase of ['width-320','width-600','reinsert','update']){
      equal(phase,'count',slots[c.layout]);equal(phase,'ownerWidth',true);equal(phase,'visibleArea',true)
      equal(phase,'urls',Array(slots[c.layout]).fill(pixel));equal(phase,'captions',Array.from({length:slots[c.layout]},(_,i)=>(phase==='update'?'Updated ':'Picture ')+i))
      const geometry=c.geometry.find(g=>g.phase===phase);assert.equal(geometry.items.length,slots[c.layout]);assert.ok(geometry.items.every(b=>b.width>0&&b.height>0))
     }
     equal('reinsert','sameItems',true);equal('dispose','cleared',0)
    }else if(group==='carousel-controls'){
     if(r.trustedPolicy&&c.kind.startsWith('output')){
      equal('static','captions',['First','Second','Third']);equal('static','videoControls',true);equal('static','ratio','16 / 9')
     }else if(c.kind==='output-disabled'){
      equal('disabled','controls',0);equal('disabled','slides',3)
     }else if(c.kind==='output-autoplay'){
      equal('autoplay','advanced',true);equal('autoplay','disposedRuntime',false)
     }else{
      equal('controls','initial',0);equal('controls','next',1);equal('controls','thumbnails',3);equal('controls','last',2);equal('controls','thumbnailSelected',0)
      equal('playback','dimensions',[16,16]);equal('playback','controls',true);equal('playback','focused',true);equal('playback','played',true)
      if(c.kind==='output-loop')equal('controls','wrap',0);else{equal('controls','firstBoundary',true);equal('controls','lastBoundary',true)}
      if(c.kind==='editor-controls')equal('controls','history',false);else equal('controls','paginationSelected',2)
     }
    }else if(group==='person-links'){
     assert.deepEqual(c.phases,['create','edit','undo','redo','output','navigation','dispose'])
     equal('edit','customIcon',true);equal('undo','history',[false,true]);equal('output','names',['Ada','Grace']);equal('output','roles',['Engineer','Admiral']);equal('output','biographies',['First biography','Second biography']);equal('output','icons',[true,true])
     const destination=get('navigation','destination').actual;assert.equal(new URL(destination.url).pathname,'/destination');assert.equal(new URL(destination.url).search,'?author=grace');assert.equal(destination.title,'Author destination');assert.equal(destination.text,'Author destination')
     assert.deepEqual(get('output','links').actual,['https://github.com/ada',destination.url]);assert.equal(get('edit','profiles').actual[1].links[0].type,'library');assert.equal(get('edit','profiles').actual[1].links[0].url,destination.url)
    }else{
     assert.ok(c.phases.includes('create')&&c.phases.includes('trigger'))
     const triggers=c.observations.filter(o=>o.phase==='trigger'&&o.property==='trusted');assert.ok(triggers.length>0);for(const o of triggers){assert.equal(o.actual,true);assert.equal(o.expected,true)}
     const before=c.kind==='gallery'?[{url:pixel,caption:'Existing'}]:c.kind==='carousel'?[{type:'image',src:pixel,alt:'Existing',caption:'Existing'}]:[{avatar:'',name:'Ada',role:'Engineer',bio:'Retain biography'}]
     equal('create','meaning',before)
     if(c.mode.startsWith('cancel')){equal('cancel','signal',true);equal('cancel','meaning',before);equal('cancel','history',false)}
     else if(c.kind==='person'&&c.mode==='crop-cancel'&&!r.trustedPolicy){equal('crop','cancelled',before);equal('crop','uploadCalls',0);equal('crop','history',false)}
     else{
      assert.ok(c.phases.includes('undo')&&c.phases.includes('redo'))
      equal('undo','meaning',before);equal('undo','history',[false,true]);equal('settle','history',true)
      if(c.kind==='person'){
       equal('avatar','fallback',[{...before[0],avatar:pixel}]);equal('avatar','cropper',false)
       if(c.mode==='crop-remote'&&!r.trustedPolicy)equal('avatar','croppedFile',{name:'avatar.webp',type:'image/webp',nonempty:true})
       else if(c.mode!=='local')equal('avatar','file',[{name:'photo.png',type:'image/png',bytes:[...Buffer.from(pixel.split(',')[1],'base64')]}])
      }else{
       const video=c.mode.startsWith('video-'),names=video?['clip.webm']:['first.png','skip.png','last.png'],accepted=c.mode==='partial'?names.filter(n=>n!=='skip.png'):names
       const videoUrl='/candidate/tests/browser/carousel-roundtrip-16x16.webm'
       let added
       if(c.mode==='action')added=c.kind==='gallery'?[{url:pixel,caption:'First'},{url:pixel,caption:'Second'}]:[{type:'image',src:pixel,alt:'First',caption:'First'},{type:'html',html:'<p>Second HTML</p>',caption:'Second'}]
       else added=accepted.map(name=>c.kind==='gallery'?{url:pixel,caption:c.mode==='local'?'':name}:{type:video?'video':'image',src:c.mode==='video-local'?'owned-video-blob':video?videoUrl:pixel,alt:name,caption:'',...(video?{poster:''}:{})})
       equal('settle','allMembers',[...before,...added]);equal('redo','meaning',[...before,...added])
       if(c.mode==='video-local'){
        equal('settle','blobPrefix',true);equal('settle','blobType','video/webm');equal('dispose','blobReleased',true)
        if(gitFiles){const expected=[...execFileSync('git',['show',candidate+':tests/browser/carousel-roundtrip-16x16.webm'])];equal('settle','blobBytes',expected);equal('redo','blobBytes',expected)}
       }
       if(['upload','partial','video-upload'].includes(c.mode)){
        const bytes=video?(gitFiles?[...execFileSync('git',['show',candidate+':tests/browser/carousel-roundtrip-16x16.webm'])]:null):[...Buffer.from(pixel.split(',')[1],'base64')]
        if(bytes)equal('settle','inputFiles',names.map(name=>({name,type:video?'video/webm':'image/png',bytes})))
       }
      }
     }
    }
    totals.executions++;totals.observations+=c.observations.length
   }
  }
  assert.equal(d.sources.find(s=>s.label==='candidate').sha,candidate)
  for(const s of d.sources){totals.modules+=Object.keys(s.loaded).length;if(gitFiles)for(const[path,digest]of Object.entries(s.loaded))assert.equal(digest,sha(execFileSync('git',['show',s.sha+':'+path],{maxBuffer:8*1024*1024})),s.label+'/'+path)}
 }
 assert.equal(totals.executions,90)
 return {candidate,...totals}
}
export function readReports(){return Object.fromEntries(['media-sources','carousel-controls','person-links','gallery-layouts'].map(g=>[g,JSON.parse(gunzipSync(readFileSync(new URL(g+'/comparison.json.gz',import.meta.url))))]))}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verify(readReports())))
