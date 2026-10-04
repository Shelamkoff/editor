// @ts-check
import { POLL_RESULTS_MODES, normalizePollResults } from '../pollData.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { isRecord, text } from './helpers.js'

export const pollDataSchema=createVersionedDataSchema({
  currentVersion:1,
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
    /** @type {'single' | 'multiple'} */
    let type='single'
    if(input.type!==undefined){
      if(input.type!=='single'&&input.type!=='multiple')throw new TypeError('Poll type must be single or multiple')
      type=input.type
    }
    if(!Array.isArray(input.options)||input.options.length<2)throw new TypeError('Poll requires at least two options')
    const ids=new Set()
    const options=input.options.map(option=>{
      if(!isRecord(option)||typeof option.id!=='string'||!option.id)throw new TypeError('Poll option requires a stable id')
      if(Object.hasOwn(option,'votes'))throw new TypeError('Poll option votes are not part of canonical poll data')
      if(ids.has(option.id))throw new Error('Duplicate poll option id: '+option.id)
      ids.add(option.id)
      return {id:option.id,text:text(option.text)}
    })
    let resultsMode='always'
    if(input.resultsMode!==undefined){
      if(typeof input.resultsMode!=='string'||!POLL_RESULTS_MODES.includes(input.resultsMode)){
        throw new TypeError('Poll resultsMode is invalid')
      }
      resultsMode=input.resultsMode
    }
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
  mapRichText(data, transform) {
    data.question = transform(data.question, 'question')
    data.options = data.options.map(option => ({ ...option, text: transform(option.text, 'option:' + option.id) }))
  },
})
