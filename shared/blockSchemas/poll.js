// @ts-check
import { POLL_RESULTS_MODES, normalizePollResults } from '../pollData.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { isRecord, text } from './helpers.js'

export const pollDataSchema=createVersionedDataSchema({
  currentVersion:1,
  legacyVersion:1,
  createDefault:()=>({
    question:'',
    type:'single',
    options:[
      {id:'option-0',text:''},
      {id:'option-1',text:''},
    ],
    resultsMode:'always',
  }),
  normalize(input){
    if(!isRecord(input))throw new TypeError('Poll data must be an object')
    const type=input.type==='multiple'?'multiple':'single'
    if(!Array.isArray(input.options)||input.options.length<2)throw new TypeError('Poll requires at least two options')
    const ids=new Set()
    const options=input.options.map(option=>{
      if(!isRecord(option)||typeof option.id!=='string'||!option.id)throw new TypeError('Poll option requires a stable id')
      if(ids.has(option.id))throw new Error('Duplicate poll option id: '+option.id)
      ids.add(option.id)
      return {id:option.id,text:text(option.text)}
    })
    const resultsMode=typeof input.resultsMode==='string'&&POLL_RESULTS_MODES.includes(input.resultsMode)
      ? input.resultsMode
      :'always'
    const data={
      question:text(input.question),
      type,
      options,
      resultsMode,
    }
    if(typeof input.pollId==='string'&&input.pollId)data.pollId=input.pollId
    if(input.initialResults!==undefined){
      data.initialResults=normalizePollResults(
        input.initialResults,
        options.map(option=>option.id),
        isRecord(input.initialResults)&&Array.isArray(input.initialResults.voters)
          ? input.initialResults.voters.length
          :50,
        type,
      )
    }
    return data
  },
})
