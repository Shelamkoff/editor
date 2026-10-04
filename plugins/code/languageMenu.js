// @ts-check
const LANGUAGES = Object.freeze([
  ['auto', 'Auto'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['php', 'PHP'],
  ['python', 'Python'], ['html', 'HTML'], ['css', 'CSS'], ['scss', 'SCSS'], ['json', 'JSON'],
  ['sql', 'SQL'], ['bash', 'Bash'], ['shell', 'Shell'], ['go', 'Go'], ['rust', 'Rust'],
  ['java', 'Java'], ['kotlin', 'Kotlin'], ['swift', 'Swift'], ['c', 'C'], ['cpp', 'C++'],
  ['csharp', 'C#'], ['xml', 'XML'], ['yaml', 'YAML'], ['toml', 'TOML'], ['markdown', 'Markdown'],
  ['docker', 'Docker'], ['nginx', 'Nginx'], ['plaintext', 'Plain text'],
])

/** Scoped searchable language control; it owns presentation, never document data.
 * @param {import('../../plugin-kit/types').BlockInstanceContext<any>} context
 * @param {(key:string,fallback?:string)=>string} translate
 * @param {(value:string)=>void} select
 * @returns {{element: HTMLDivElement, update: (language: string) => void, setEditable: (value: boolean) => void, destroy: () => void}} Scoped language selector view.
 */
export function createLanguageMenu(context, translate, select) {
  const document = context.ownerDocument
  const element = document.createElement('div')
  element.className = 'oe-code-language'
  element.style.flex = '1'
  const dropdown = document.createElement('div')
  dropdown.className = 'oe-code-dropdown'
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'oe-code-dropdown__trigger'
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.setAttribute('aria-label', translate('language', 'Language'))
  const label = document.createElement('span')
  label.className = 'oe-code-lang-label'
  const panel = document.createElement('div')
  panel.className = 'oe-code-dropdown__panel'
  panel.inert = true
  const search = document.createElement('input')
  search.type = 'text'
  search.className = 'oe-code-dropdown__search'
  search.placeholder = translate('search', 'Search...')
  search.setAttribute('role', 'combobox')
  search.setAttribute('aria-label', translate('search', 'Search...'))
  search.setAttribute('aria-autocomplete', 'list')
  search.setAttribute('aria-expanded', 'false')
  const list = document.createElement('div')
  list.className = 'oe-code-dropdown__list'
  list.id = context.createId('code-languages')
  list.setAttribute('role', 'listbox')
  search.setAttribute('aria-controls', list.id)
  trigger.setAttribute('aria-controls', list.id)
  panel.append(search, list)
  dropdown.append(trigger, panel)
  element.append(dropdown, label)
  let open = false
  let editable = false
  let dead = false
  let focused = -1
  const options = LANGUAGES.map(([value, name]) => {
    const option = document.createElement('div')
    option.className = 'oe-code-dropdown__item'
    option.id = `${list.id}-${value}`
    option.dataset.value = value
    option.setAttribute('role', 'option')
    option.textContent = value === 'auto' ? translate('languageAuto', name)
      : value === 'plaintext' ? translate('languagePlainText', name) : name
    option.addEventListener('mousedown', event => event.preventDefault(), { signal: context.signal })
    option.addEventListener('click', () => choose(value), { signal: context.signal })
    list.appendChild(option)
    return option
  })
  const clearFocus = () => {
    focused = -1
    search.removeAttribute('aria-activedescendant')
    for (const option of options) option.classList.remove('oe-code-dropdown__item--focused')
  }
  const close = (restoreFocus = false) => {
    open = false
    dropdown.classList.remove('oe-code-dropdown--open')
    trigger.setAttribute('aria-expanded', 'false')
    search.setAttribute('aria-expanded', 'false')
    panel.inert = true
    clearFocus()
    if (restoreFocus && editable && !dead) trigger.focus()
  }
  const filter = () => {
    clearFocus()
    const query = search.value.toLowerCase().trim()
    for (const option of options) {
      option.style.display = `${option.textContent} ${option.dataset.value}`.toLowerCase().includes(query) ? '' : 'none'
    }
  }
  const show = () => {
    if (!editable || dead) return
    open = true
    search.value = ''
    filter()
    dropdown.classList.add('oe-code-dropdown--open')
    panel.inert = false
    trigger.setAttribute('aria-expanded', 'true')
    search.setAttribute('aria-expanded', 'true')
    search.focus()
  }
  function choose(value) {
    if (!editable || dead || context.isReadOnly()) return
    select(value)
    close(true)
  }
  trigger.addEventListener('click', () => open ? close(true) : show(), { signal: context.signal })
  trigger.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    event.stopPropagation()
    show()
  }, { signal: context.signal })
  search.addEventListener('input', filter, { signal: context.signal })
  search.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') { close(true); return }
    const visible = options.filter(option => option.style.display !== 'none')
    if (event.key === 'Enter') {
      const option = visible[focused < 0 ? 0 : focused]
      if (option) choose(option.dataset.value)
      return
    }
    if (!visible.length) return
    focused = focused < 0 ? (event.key === 'ArrowUp' ? visible.length - 1 : 0)
      : (focused + (event.key === 'ArrowUp' ? -1 : 1) + visible.length) % visible.length
    for (const option of options) option.classList.toggle('oe-code-dropdown__item--focused', option === visible[focused])
    search.setAttribute('aria-activedescendant', visible[focused].id)
    visible[focused].scrollIntoView({ block: 'nearest' })
  }, { signal: context.signal })
  const outside = event => { if (open && !element.contains(event.target)) close() }
  document.addEventListener('mousedown', outside, { signal: context.signal })
  return {
    element,
    update(value) {
      const option = options.find(option => option.dataset.value === value)
      const name = option?.textContent ?? value
      trigger.textContent = name + ' ▾'
      label.textContent = name
      for (const option of options) {
        const active = option.dataset.value === value
        option.classList.toggle('oe-code-dropdown__item--active', active)
        option.setAttribute('aria-selected', String(active))
      }
    },
    setEditable(value) {
      editable = value
      dropdown.hidden = !value
      label.hidden = value
      trigger.disabled = !value
      if (!value) close()
    },
    destroy() {
      if (dead) return
      dead = true
      close()
      document.removeEventListener('mousedown', outside)
    },
  }
}
