import test from 'node:test'
import assert from 'node:assert/strict'
import { carouselDataSchema } from './blockSchemas/carousel.js'

test('carousel current schema keeps canonical positive delays and defaults omitted delay', () => {
  const base=carouselDataSchema.createDefault()
  assert.equal(base.options.autoplayDelay,3000)
  for(const value of [1,3000,3000.9]){
    const encoded=carouselDataSchema.encode({
      ...base,
      slides:[{id:'s',type:'image',src:'/image.png',alt:'',caption:''}],
      options:{...base.options,autoplayDelay:value},
    })
    assert.equal(encoded.data.options.autoplayDelay,Math.floor(value))
  }
})
