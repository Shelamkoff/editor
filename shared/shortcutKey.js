// @ts-check
/** Resolve letter/digit shortcuts independently of the active keyboard layout. */
export function shortcutKey(event) {
  const code = String(event?.code ?? '')
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  return String(event?.key ?? '').toLowerCase()
}
