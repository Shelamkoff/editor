// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TUNING, resolveTuning } from './config.js'

test('resolveTuning returns an independent complete configuration', () => {
  const resolved = resolveTuning({ undo: { debounceMs: 0 } })
  assert.deepEqual(resolved, {
    ...DEFAULT_TUNING,
    drag: { ...DEFAULT_TUNING.drag },
    undo: { ...DEFAULT_TUNING.undo, debounceMs: 0 },
    change: { ...DEFAULT_TUNING.change },
    toolbar: { ...DEFAULT_TUNING.toolbar },
    animations: { ...DEFAULT_TUNING.animations },
  })
  assert.notEqual(resolved.undo, DEFAULT_TUNING.undo)
})

test('resolveTuning rejects invalid numeric leaves', () => {
  const cases = [
    [{ drag: { threshold: -1 } }, 'tuning.drag.threshold'],
    [{ undo: { maxStack: 1.5 } }, 'tuning.undo.maxStack'],
    [{ undo: { maxStack: 0 } }, 'tuning.undo.maxStack'],
    [{ undo: { debounceMs: Number.NaN } }, 'tuning.undo.debounceMs'],
    [{ change: { debounceMs: Number.POSITIVE_INFINITY } }, 'tuning.change.debounceMs'],
    [{ toolbar: { filterThreshold: 1.5 } }, 'tuning.toolbar.filterThreshold'],
    [{ animations: { blockMoveMs: -1 } }, 'tuning.animations.blockMoveMs'],
    [{ mobileBreakpoint: -1 }, 'tuning.mobileBreakpoint'],
  ]
  for (const [config, path] of cases) {
    assert.throws(() => resolveTuning(config), new RegExp(path.replaceAll('.', '\\.')))
  }
})

test('resolveTuning rejects malformed tuning groups', () => {
  const cases = [
    ['invalid', 'tuning'],
    [null, 'tuning'],
    [{ undo: 'invalid' }, 'tuning.undo'],
    [{ drag: 42 }, 'tuning.drag'],
    [{ change: null }, 'tuning.change'],
    [{ toolbar: [] }, 'tuning.toolbar'],
    [{ animations: true }, 'tuning.animations'],
  ]
  for (const [config, path] of cases) {
    assert.throws(() => resolveTuning(config), new RegExp(`${path.replaceAll('.', '\\.')} must be an object`))
  }
})

test('resolveTuning ignores inherited top-level tuning values without reading them', () => {
  let reads = 0
  const prototype = {}
  for (const key of ['drag', 'undo', 'change', 'toolbar', 'animations', 'mobileBreakpoint']) {
    Object.defineProperty(prototype, key, {
      configurable: true,
      get() { reads++; throw new Error(`inherited tuning ${key} accessed`) },
    })
  }
  const tuning = Object.create(prototype)
  assert.deepEqual(resolveTuning(tuning), {
    ...DEFAULT_TUNING,
    drag: { ...DEFAULT_TUNING.drag },
    undo: { ...DEFAULT_TUNING.undo },
    change: { ...DEFAULT_TUNING.change },
    toolbar: { ...DEFAULT_TUNING.toolbar },
    animations: { ...DEFAULT_TUNING.animations },
  })
  assert.equal(reads, 0)
})
