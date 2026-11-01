// Decision experiment; no production import until the HTML contract is accepted.
export function rebaseViewportUnits(css, viewport) {
  const number = /[+-]?(?:[0-9]*\.[0-9]+|[0-9]+)(?:[eE][+-]?[0-9]+)?/y
  let result = '', position = 0
  const nameCharacter = character => !!character && /[a-z0-9_-]|[^\x00-\x7f]/i.test(character)
  const nameStart = character => !!character && /[a-z_-]|[^\x00-\x7f]/i.test(character)
  const whitespace = character => !!character && /[\t\n\f\r ]/.test(character)
  const validEscape = index => css[index] === '\\' && index + 1 < css.length && !/[\n\r\f]/.test(css[index + 1])
  const escaped = start => {
    let end = start + 1
    const hex = /^[a-f0-9]{1,6}/i.exec(css.slice(end))?.[0]
    if (!hex) return { end: end + 1, value: css[end] }
    end += hex.length
    if (whitespace(css[end])) end += css[end] === '\r' && css[end + 1] === '\n' ? 2 : 1
    const code = parseInt(hex, 16)
    return { end, value: String.fromCodePoint(!code || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff ? 0xfffd : code) }
  }
  const name = start => {
    let end = start, value = ''
    while (end < css.length) {
      if (nameCharacter(css[end])) value += css[end++]
      else if (validEscape(end)) {
        const escape = escaped(end)
        value += escape.value; end = escape.end
      } else break
    }
    return { end, value }
  }
  const stringEnd = start => {
    const quote = css[start]
    let end = start + 1
    while (end < css.length) {
      if (css[end] === quote) return end + 1
      if (css[end] === '\\') end += css[end + 1] === '\r' && css[end + 2] === '\n' ? 3 : 2
      else end++
    }
    return end
  }
  const basis = unit => {
    const kind = /^(?:[sld])?v(h|w|min|max|i|b)$/.exec(unit.toLowerCase())?.[1]
    if (kind === 'h') return viewport.height
    if (kind === 'w') return viewport.width
    if (kind === 'min') return Math.min(viewport.width, viewport.height)
    if (kind === 'max') return Math.max(viewport.width, viewport.height)
    if (kind === 'i') return viewport.vertical ? viewport.height : viewport.width
    if (kind === 'b') return viewport.vertical ? viewport.width : viewport.height
    return null
  }
  while (position < css.length) {
    const start = position, character = css[position]
    if (character === '/' && css[position + 1] === '*') {
      const close = css.indexOf('*/', position + 2)
      position = close < 0 ? css.length : close + 2
      result += css.slice(start, position)
      continue
    }
    if (character === '"' || character === "'") {
      position = stringEnd(position)
      result += css.slice(start, position)
      continue
    }
    if (character === '#' && (nameCharacter(css[position + 1]) || validEscape(position + 1))) {
      position = name(position + 1).end
      result += css.slice(start, position)
      continue
    }
    number.lastIndex = position
    const numeric = number.exec(css)
    if (numeric) {
      const unitStart = number.lastIndex, unit = name(unitStart)
      const reference = basis(unit.value)
      position = unit.end
      if (reference === null) result += css.slice(start, position)
      else {
        const pixels = Number(numeric[0]) * reference / 100
        result += Number.isFinite(pixels)
          ? `${Object.is(pixels, -0) ? '-0' : pixels}px`
          : `calc(${numeric[0]} * ${reference / 100}px)`
        // Hex escapes consume their whitespace terminator as part of the
        // identifier. Retain a separator when serializing a replacement.
        if (whitespace(css[position - 1])) result += css[position - 1]
      }
      continue
    }
    if (nameStart(character) || validEscape(position)) {
      const identifier = name(position)
      position = identifier.end
      if (identifier.value.toLowerCase() === 'url' && css[position] === '(') {
        let depth = 1
        position++
        while (position < css.length && depth) {
          if (css[position] === '"' || css[position] === "'") position = stringEnd(position)
          else if (css[position] === '\\') position += 2
          else {
            if (css[position] === '(') depth++
            else if (css[position] === ')') depth--
            position++
          }
        }
      }
      result += css.slice(start, position)
      continue
    }
    result += character
    position++
  }
  return result
}
