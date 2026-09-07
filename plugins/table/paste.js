/** Convert an HTML table to the supported rectangular, unmerged data model.
 * A spanning cell contributes its content once, at its upper-left slot; the
 * covered slots are empty. Nested table rows are not rows of this table.
 * @param {HTMLTableElement} table
 * @returns {{ content: string[][], withHeadings: boolean } | null}
 */
export function tablePasteData(table) {
  const rows = Array.from(table.rows)
  if (!rows.length) return null
  /** @type {string[][]} */
  const grid = rows.map(() => [])
  const groupEnds = new Map()
  rows.forEach((row, index) => groupEnds.set(row.parentElement, index + 1))
  let width = 0
  for (const [y, row] of rows.entries()) {
    let x = 0
    for (const cell of row.cells) {
      while (grid[y][x] !== undefined) x++
      const endX = x + cell.colSpan
      const groupEnd = groupEnds.get(row.parentElement)
      const endY = cell.rowSpan === 0 ? groupEnd : Math.min(y + cell.rowSpan, groupEnd)
      width = Math.max(width, endX)
      // Spans come from untrusted clipboard HTML. Refuse excessive expansion
      // rather than allocating an unbounded grid or silently dropping cells.
      if (width * rows.length > 100_000) throw new RangeError('Pasted table expands beyond 100000 cells')
      for (let r = y; r < endY; r++) {
        for (let c = x; c < endX; c++) {
          if (grid[r][c] !== undefined) throw new RangeError('Pasted table contains overlapping cells')
          grid[r][c] = ''
        }
      }
      grid[y][x] = cell.innerHTML.trim()
      x = endX
    }
  }
  if (!width) return null
  const first = rows.find(row => row.cells.length > 0)
  return {
    content: grid.map(row => Array.from({ length: width }, (_, x) => row[x] ?? '')),
    withHeadings: !!first && Array.from(first.cells).some(cell => cell.tagName === 'TH'),
  }
}
