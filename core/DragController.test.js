import test from 'node:test'
import assert from 'node:assert/strict'

import { dragGapAtY, resolveDragGap } from './DragController.js'

test('resolveDragGap uses order without the dragged id for every gap', () => {
  const order=['A','B','C','D']
  const cases=[
    [{beforeId:'B',afterId:null,gap:0},0],
    [{beforeId:'C',afterId:'B',gap:1},1],
    [{beforeId:'D',afterId:'C',gap:2},2],
    [{beforeId:null,afterId:'D',gap:3},3],
  ]
  for(const [placement,expected] of cases){
    assert.equal(resolveDragGap(order,'A',placement),expected)
  }

  // A/B/C/D, drag A into the gap between B and C -> B/A/C/D.
  assert.equal(resolveDragGap(order,'A',{beforeId:'C',afterId:'B',gap:1}),1)
  // Drag C back into its current gap between B and D -> no-op index 2.
  assert.equal(resolveDragGap(order,'C',{beforeId:'D',afterId:'B',gap:2}),2)
})

test('resolveDragGap falls back from missing anchor to the surviving opposite anchor', () => {
  assert.equal(
    resolveDragGap(['A','B','C','D'],'A',{beforeId:'missing',afterId:'B',gap:0}),
    1,
  )
  assert.equal(
    resolveDragGap(['A','B','C','D'],'D',{beforeId:'C',afterId:'missing',gap:0}),
    2,
  )
})

test('dragGapAtY maps controlled geometry to gaps without inspecting payload', () => {
  const rects=new Map([
    ['B',{top:0,height:20}],
    ['C',{top:20,height:20}],
    ['D',{top:40,height:20}],
  ])
  const elementFor=id=>({
    getBoundingClientRect(){return rects.get(id)},
  })
  const ids=['B','C','D']
  assert.equal(dragGapAtY(ids,elementFor,-1),0)
  assert.equal(dragGapAtY(ids,elementFor,9),0)
  assert.equal(dragGapAtY(ids,elementFor,11),1)
  assert.equal(dragGapAtY(ids,elementFor,31),2)
  assert.equal(dragGapAtY(ids,elementFor,100),3)
})
