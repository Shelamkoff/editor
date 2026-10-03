// @ts-check
import { normalizeCarouselAspectRatio } from '../carouselData.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, text } from './helpers.js'

export const carouselDataSchema=createVersionedDataSchema({
  currentVersion:1,
  createDefault:()=>({
    slides:[],
    options:{
      loop:false,
      autoplay:false,
      autoplayDelay:3000,
      navigation:true,
      pagination:true,
      thumbnails:false,
    },
  }),
  normalize(input){
    if(!isRecord(input))throw new TypeError('Carousel data must be an object')
    if(!Array.isArray(input.slides))throw new TypeError('Carousel slides must be an array')
    const ids=new Set()
    const slides=input.slides.map(slide=>{
      if(!isRecord(slide)||typeof slide.id!=='string'||!slide.id)throw new TypeError('Carousel slide requires a stable id')
      if(ids.has(slide.id))throw new Error('Duplicate carousel slide id: '+slide.id)
      ids.add(slide.id)
      const type=slide.type==='video'||slide.type==='html'?'video'===slide.type?'video':'html':'image'
      const result={id:slide.id,type}
      if(type==='html'){
        if(typeof slide.html!=='string')throw new TypeError('Carousel HTML slide requires html')
        result.html=slide.html
      }else{
        result.src=canonicalUrl(typeof slide.src==='string'?slide.src:'','media',{allowEmpty:false})
        result.alt=text(slide.alt)
        if(type==='video')result.poster=canonicalUrl(typeof slide.poster==='string'?slide.poster:'','media')
      }
      result.caption=text(slide.caption)
      return result
    })
    const source=isRecord(input.options)?input.options:{}
    const options={
      loop:source.loop===true,
      autoplay:source.autoplay===true,
      autoplayDelay:typeof source.autoplayDelay==='number'&&Number.isFinite(source.autoplayDelay)&&source.autoplayDelay>0
        ?Math.floor(source.autoplayDelay)
        :3000,
      navigation:source.navigation!==false,
      pagination:source.pagination!==false,
      thumbnails:source.thumbnails===true,
    }
    const aspectRatio=normalizeCarouselAspectRatio(source.aspectRatio)
    if(aspectRatio)options.aspectRatio=aspectRatio
    return {slides,options}
  },
  mapRichText(data,transform){
    data.slides=data.slides.map(slide=>({
      ...slide,
      caption:transform(slide.caption,'slide:'+slide.id+':caption'),
    }))
  },
})
