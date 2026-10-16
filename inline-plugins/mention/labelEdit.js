// @ts-check

/** @typedef {{trigger:string,current:Readonly<{id:string,name:string}>,display:string,range:Readonly<{start:number,end:number}>,replacement:string}} MentionLabelEdit */
/** @typedef {{kind:'update',data:{id:string,name:string},caret:number}|{kind:'remove',caret:0}|{kind:'replace-text',text:string,caret:number}} MentionLabelDecision */

/** True when an offset lies inside a UTF-16 surrogate pair.
 * @param {string} text
 * @param {number} offset
 */
function splitsCodePoint(text, offset) {
  if (offset <= 0 || offset >= text.length) return false
  const left = text.charCodeAt(offset - 1)
  const right = text.charCodeAt(offset)
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff
}

/** Shared UTF-16 code-point deletion interval for a collapsed caret.
 * @param {string} text
 * @param {number} offset
 * @param {'backward'|'forward'} direction
 * @returns {{start:number,end:number}|null}
 */
export function mentionCharacterDeletion(text, offset, direction) {
  if (typeof text !== 'string' || !Number.isInteger(offset) || offset < 0
    || offset > text.length || splitsCodePoint(text, offset)) return null
  if (direction === 'backward') {
    if (offset === 0) return null
    const left = text.charCodeAt(offset - 1)
    const previous = offset > 1 ? text.charCodeAt(offset - 2) : -1
    return { start: left >= 0xdc00 && left <= 0xdfff
      && previous >= 0xd800 && previous <= 0xdbff ? offset - 2 : offset - 1, end: offset }
  }
  if (direction === 'forward') {
    if (offset === text.length) return null
    const left = text.charCodeAt(offset)
    const next = offset + 1 < text.length ? text.charCodeAt(offset + 1) : -1
    return { start: offset, end: left >= 0xd800 && left <= 0xdbff
      && next >= 0xdc00 && next <= 0xdfff ? offset + 2 : offset + 1 }
  }
  return null
}

/** Pure, host-independent Mention text decision. No DOM, search, clipboard,
 * persistence, native selection or lifecycle authority lives here.
 * @param {MentionLabelEdit} input
 * @returns {MentionLabelDecision}
 */
export function decideMentionLabelEdit({ trigger, current, display, range, replacement }) {
  if (typeof trigger !== 'string' || Array.from(trigger).length !== 1
    || !current || typeof current.id !== 'string' || typeof current.name !== 'string'
    || typeof display !== 'string' || typeof replacement !== 'string'
    || !range || !Number.isInteger(range.start) || !Number.isInteger(range.end)
    || range.start < 0 || range.end < range.start || range.end > display.length
    || splitsCodePoint(display, range.start) || splitsCodePoint(display, range.end)) {
    throw new TypeError('Invalid Mention label edit')
  }
  const next = display.slice(0, range.start) + replacement + display.slice(range.end)
  const caret = range.start + replacement.length
  if (!next) return Object.freeze({ kind: /** @type {'remove'} */ ('remove'), caret: /** @type {0} */ (0) })
  if (!next.startsWith(trigger)) {
    return Object.freeze({ kind: /** @type {'replace-text'} */ ('replace-text'), text: next, caret })
  }
  return Object.freeze({
    kind: /** @type {'update'} */ ('update'),
    data: Object.freeze({ id: current.id, name: next.slice(trigger.length) }),
    caret,
  })
}
