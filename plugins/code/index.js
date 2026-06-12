import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'

const editorStyles = resolvePath('./code.css', import.meta.url)

/** @type {WeakMap<HTMLElement, {code: string, language: string, editMode: boolean}>} */
const codeStateMap = new WeakMap()

/** @type {WeakMap<HTMLElement, {textarea: HTMLTextAreaElement, pre: HTMLPreElement, codeEl: HTMLElement, copyBtn: HTMLElement, editBtn: HTMLElement, dropdown: HTMLElement, dropdownTrigger: HTMLElement, langLabel: HTMLElement}>} */
const refsMap = new WeakMap()

/** @type {WeakMap<HTMLElement, (e: MouseEvent) => void>} */
const docMousedownMap = new WeakMap()

/** @type {WeakMap<HTMLElement, {panel: HTMLElement, search: HTMLInputElement, list: HTMLElement, trigger: HTMLElement, focusedIndex: number}>} */
const dropdownRefsMap = new WeakMap()

// Tabler icon: source-code
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l-4 4l4 4"/><path d="M17 8l4 4l-4 4"/><path d="M14 4l-4 16"/></svg>'

// Tabler icons for buttons
const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
const ICON_EDIT = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'

const LANGUAGES = [
  { value: 'auto',       label: 'Auto' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'php',        label: 'PHP' },
  { value: 'python',     label: 'Python' },
  { value: 'html',       label: 'HTML' },
  { value: 'css',        label: 'CSS' },
  { value: 'scss',       label: 'SCSS' },
  { value: 'json',       label: 'JSON' },
  { value: 'sql',        label: 'SQL' },
  { value: 'bash',       label: 'Bash' },
  { value: 'shell',      label: 'Shell' },
  { value: 'go',         label: 'Go' },
  { value: 'rust',       label: 'Rust' },
  { value: 'java',       label: 'Java' },
  { value: 'kotlin',     label: 'Kotlin' },
  { value: 'swift',      label: 'Swift' },
  { value: 'c',          label: 'C' },
  { value: 'cpp',        label: 'C++' },
  { value: 'csharp',     label: 'C#' },
  { value: 'xml',        label: 'XML' },
  { value: 'yaml',       label: 'YAML' },
  { value: 'toml',       label: 'TOML' },
  { value: 'markdown',   label: 'Markdown' },
  { value: 'docker',     label: 'Docker' },
  { value: 'nginx',      label: 'Nginx' },
  { value: 'plaintext',  label: 'Plain text' },
]


/**
 * @param {HTMLElement} list
 * @param {string} query
 */
function filterDropdownItems(list, query) {
  const q = query.toLowerCase()
  for (let i = 0; i < list.children.length; i++) {
    const item = /** @type {HTMLElement} */ (list.children[i])
    const text = (item.textContent || '').toLowerCase()
    item.style.display = text.includes(q) ? '' : 'none'
  }
}

/** @param {HTMLElement} list @returns {HTMLElement[]} */
function getVisibleItems(list) {
  const result = []
  for (let i = 0; i < list.children.length; i++) {
    const el = /** @type {HTMLElement} */ (list.children[i])
    if (el.style.display !== 'none') result.push(el)
  }
  return result
}

/** @param {HTMLElement} list */
function clearDropdownFocus(list) {
  for (const item of list.children) {
    item.classList.remove('oe-code-dropdown__item--focused')
  }
}

/**
 * @param {HTMLElement} list
 * @param {number} currentIdx
 * @param {number} dir
 * @returns {number}
 */
function moveDropdownFocus(list, currentIdx, dir) {
  const visible = getVisibleItems(list)
  if (visible.length === 0) return -1
  clearDropdownFocus(list)
  let idx = currentIdx + dir
  if (idx < 0) idx = visible.length - 1
  if (idx >= visible.length) idx = 0
  visible[idx]?.classList.add('oe-code-dropdown__item--focused')
  visible[idx]?.scrollIntoView({ block: 'nearest' })
  return idx
}


/** @type {Promise<object> | null} */
let _hljsLoadPromise = null

/**
 * Load highlight.js (all languages bundle) from CDN (once).
 * @returns {Promise<object>}
 */
function loadHljs() {
  if (/** @type {any} */ (window).hljs) return Promise.resolve(/** @type {any} */ (window).hljs)
  if (_hljsLoadPromise) return _hljsLoadPromise

  _hljsLoadPromise = new Promise(function (resolve, reject) {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'
    script.onload = function () {
      const hljs = /** @type {any} */ (window).hljs
      if (hljs) {
        resolve(hljs)
      } else {
        reject(new Error('hljs not found on window'))
      }
    }
    script.onerror = function () {
      reject(new Error('Failed to load highlight.js from CDN'))
    }
    document.head.appendChild(script)
  })

  return _hljsLoadPromise
}

/** @type {any} module-level hljs ref (avoids private field issues in closures) */
let _hljs = null

/**
 * Highlight a code block wrapper using hljs (if loaded).
 * @param {HTMLElement} wrapper
 */
function highlightCodeBlock(wrapper) {
  const state = codeStateMap.get(wrapper)
  const refs = refsMap.get(wrapper)
  const codeEl = refs && refs.codeEl
  if (!codeEl || !state) return

  const code = state.code
  const lang = state.language

  codeEl.className = lang === 'auto' ? '' : 'language-' + lang
  delete codeEl.dataset.highlighted

  // Trailing newline keeps pre height = textarea height
  codeEl.textContent = code + '\n'

  if (!_hljs) {
    codeEl.classList.add('hljs')
    return
  }

  try {
    if (lang === 'auto') {
      const result = _hljs.highlightAuto(code)
      if (result.language) {
        codeEl.innerHTML = result.value + '\n'
        codeEl.classList.add('hljs', 'language-' + result.language)
      } else {
        codeEl.classList.add('hljs')
      }
    } else if (_hljs.getLanguage(lang)) {
      const result = _hljs.highlight(code, { language: lang, ignoreIllegals: true })
      codeEl.innerHTML = result.value + '\n'
      codeEl.classList.add('hljs')
    } else {
      codeEl.classList.add('hljs')
    }
    codeEl.dataset.highlighted = 'yes'
  } catch (e) {
    codeEl.classList.add('hljs')
  }
}


export class Code extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'code'
  icon = ICON
  inlineTools = false

  /** @returns {string} */
  get title() {
    return this._t('title', 'Code')
  }

  /**
   * @param {{ hljs?: object }} [config]
   */
  constructor(config) {
    super(config)
    if (config && config.hljs) {
      _hljs = config.hljs
    } else if (!_hljs && !_hljsLoadPromise) {
      // Autoload from CDN
      void loadHljs().then(function (hljs) {
        _hljs = hljs
        // Re-highlight all existing code blocks
        const wrappers = document.querySelectorAll('.oe-code-wrap')
        for (let i = 0; i < wrappers.length; i++) {
          highlightCodeBlock(/** @type {HTMLElement} */ (wrappers[i]))
        }
      }).catch(function (err) {
        console.warn('[Code] Failed to load highlight.js:', err)
      })
    }
  }

  pasteConfig = {
    tags: ['pre', 'code'],
    patterns: [
      // ── PHP: <?php or <?= at line start ──
      /^<\?(php\b|=)/m,

      // ── JavaScript: import ... from '...', export default, const x = require() ──
      /^import\s+[\w{*][\w\s{},*]*\s+from\s+['"]/m,
      /^export\s+(default\s+)?(function|class|const|let)\b/m,
      /^const\s+\w+\s*=\s*require\s*\(/m,

      // ── TypeScript: interface X {, type X =, import type ──
      /^interface\s+\w+\s*(<[\w,\s]+>\s*)?\{/m,
      /^type\s+\w+(<[\w,\s]+>)?\s*=/m,
      /^import\s+type\s+/m,

      // ── Python: def func(...):, class X:, from x import, if __name__ ──
      /^def\s+\w+\s*\(.*\)\s*(->\s*\w+\s*)?:/m,
      /^class\s+\w+.*:\s*$/m,
      /^from\s+[\w.]+\s+import\s+/m,
      /^if\s+__name__\s*==\s*['"]__main__['"]/m,

      // ── HTML: <!DOCTYPE or <html ──
      /^\s*<!DOCTYPE\s+html/i,
      /^\s*<html[\s>]/im,

      // ── CSS/SCSS: selectors with braces, @media, @keyframes, @import url ──
      /^@media\s*[\s(]/m,
      /^@keyframes\s+\w/m,
      /^@import\s+url\s*\(/m,
      /^[.#]\w[\w-]*\s*\{[^}]*}/m,

      // ── JSON: { "key": or [ { ──
      /^\s*\{\s*\n\s*"[\w$]+":\s/,
      /^\s*\[\s*\n\s*\{/,

      // ── SQL: SELECT ... FROM, CREATE TABLE, INSERT INTO ──
      /^\s*SELECT\s+[\w.*,\s]+\s+FROM\s+\w/im,
      /^\s*CREATE\s+(TABLE|VIEW|INDEX|DATABASE|FUNCTION|PROCEDURE)\s+/im,
      /^\s*INSERT\s+INTO\s+\w/im,
      /^\s*ALTER\s+TABLE\s+\w/im,

      // ── Bash/Shell: shebang ──
      /^#!\s*\/(?:usr\/)?bin\/(bash|sh|zsh|env)\b/,

      // ── Go: package main\n, func main() { ──
      /^package\s+\w+\s*\n/m,
      /^func\s+(\(\s*\w+\s+\*?\w+\s*\)\s*)?\w+\s*\(/m,

      // ── Rust: fn name(, use std::, #[derive(, impl X for Y ──
      /^fn\s+\w+\s*(<[\w,\s:]+>\s*)?\(/m,
      /^use\s+(std|crate|super|self)::/m,
      /^#\[(derive|allow|cfg|test|macro_use)\b/m,
      /^impl\s+(<[\w,\s:]+>\s*)?\w+\s+(for\s+)?\w/m,

      // ── Java: package x.y.z;, import java., public static void main ──
      /^package\s+[\w.]+;\s*$/m,
      /^import\s+(static\s+)?javax?\./m,
      /^public\s+static\s+void\s+main\s*\(/m,
      /^@(Override|Component|Service|Entity|Repository|Controller|Autowired|Bean)\b/m,

      // ── Kotlin: fun name(, data class, val/var x:, suspend fun ──
      /^fun\s+\w+\s*[(<]/m,
      /^(data\s+)?class\s+\w+.*\{/m,
      /^suspend\s+fun\s+/m,
      /^import\s+kotlinx?\./m,

      // ── Swift: import Foundation/UIKit/SwiftUI, func x() ->, @IBOutlet ──
      /^import\s+(Foundation|UIKit|SwiftUI|Combine|CoreData)\b/m,
      /^func\s+\w+\s*\(.*\)\s*(->\s*\w)/m,
      /^@(IBOutlet|IBAction|objc|available|Published)\b/m,
      /^guard\s+let\s+\w+/m,

      // ── C/C++: #include <header> or "header" ──
      /^#include\s*<[\w./]+>/m,
      /^#include\s*"[\w./]+"/m,
      /^using\s+namespace\s+std\s*;/m,
      /^(std|boost|fmt)::\w+/m,
      /^template\s*<(class|typename)\s/m,

      // ── C#: using System;, namespace X {, [HttpGet], [Serializable] ──
      /^using\s+System[\w.]*;\s*$/m,
      /^namespace\s+[\w.]+\s*[;{]/m,
      /^\[(HttpGet|HttpPost|HttpPut|HttpDelete|Authorize|ApiController|Serializable|Route)\b/m,

      // ── XML: <?xml, standalone tags with xmlns ──
      /^\s*<\?xml\s+version=/im,
      /^\s*<[\w:-]+\s+xmlns[=:]/im,

      // ── YAML: key:\n  nested-key: val (multiline structure required) ──
      /^\w[\w.-]*:\s*\n\s+\w[\w.-]*:\s/m,

      // ── TOML: [section]\nkey = ──
      /^\[\w[\w.-]*]\s*\n\w[\w.-]*\s*=/m,

      // ── Markdown: fenced code block ```lang ──
      /^```\w+\s*\n/m,

      // ── Dockerfile: FROM image:tag ──
      /^FROM\s+\w[\w./:@-]+\s*$/m,

      // ── Nginx: server {, location /, proxy_pass ──
      /^(http|server|location|upstream)\s*[{\/~]/m,
      /^\s*proxy_pass\s+https?:\/\//m,
    ],
  }

  /**
   * @param {{ code?: string, language?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const code = data.code ?? ''
    const language = data.language ?? 'auto'

    // ── Wrapper (non-editable, focusable) ──
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-code-wrap')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1
    wrapper.dataset.lang = language

    // State stored via WeakMap for save()
    codeStateMap.set(wrapper, { code, language, editMode: false })

    // ── Header bar ──
    const bar = document.createElement('div')
    bar.className = 'oe-code-bar'

    const dots = document.createElement('span')
    dots.className = 'oe-code-dots'
    dots.innerHTML = '<span></span><span></span><span></span>'

    const { dropdown, trigger: dropdownTrigger, langLabel } = this.#buildDropdown(wrapper)

    const copyBtn = document.createElement('button')
    copyBtn.className = 'oe-code-btn oe-code-btn--copy'
    copyBtn.type = 'button'
    copyBtn.title = this._t('copy', 'Copy')
    copyBtn.innerHTML = ICON_COPY
    copyBtn.addEventListener('click', () => this.#copy(wrapper, copyBtn))

    const editBtn = document.createElement('button')
    editBtn.className = 'oe-code-btn oe-code-btn--edit'
    editBtn.type = 'button'
    editBtn.title = this._t('edit', 'Edit')
    editBtn.innerHTML = ICON_EDIT
    editBtn.addEventListener('click', () => {
      if (codeStateMap.get(wrapper)?.editMode) {
        this.#switchToView(wrapper)
      } else {
        this.#switchToEdit(wrapper)
      }
    })

    bar.appendChild(dots)
    bar.appendChild(dropdown)
    bar.appendChild(langLabel)
    bar.appendChild(copyBtn)
    bar.appendChild(editBtn)

    // ── Stacked editor area ──
    const editorWrap = document.createElement('div')
    editorWrap.className = 'oe-code-editor'

    const pre = document.createElement('pre')
    pre.className = 'oe-code-pre'
    const codeEl = document.createElement('code')
    codeEl.className = language === 'auto' ? '' : `language-${language}`
    pre.appendChild(codeEl)

    pre.addEventListener('click', () => {
      if (!codeStateMap.get(wrapper)?.editMode) this.#switchToEdit(wrapper)
    })

    const textarea = document.createElement('textarea')
    textarea.className = 'oe-code-textarea'
    textarea.placeholder = this._t('placeholder', '// Write code...')
    textarea.spellcheck = false
    textarea.value = code

    textarea.addEventListener('input', () => {
      const st = codeStateMap.get(wrapper)
      if (st) st.code = textarea.value
      this.#syncScroll(wrapper)
      this.#highlight(wrapper)
      // Trigger undo/redo snapshot (textarea input doesn't bubble to EditorFacade)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })

    textarea.addEventListener('paste', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const text = /** @type {ClipboardEvent} */ (e).clipboardData?.getData('text/plain') || ''
      const s = textarea.selectionStart
      const end = textarea.selectionEnd
      textarea.value = textarea.value.substring(0, s) + text + textarea.value.substring(end)
      textarea.selectionStart = textarea.selectionEnd = s + text.length
      const st = codeStateMap.get(wrapper)
      if (st) st.code = textarea.value
      this.#highlight(wrapper)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })

    textarea.addEventListener('scroll', () => this.#syncScroll(wrapper))

    textarea.addEventListener('keydown', (e) => {
      this.#handleKeydown(e, wrapper, textarea)
    })

    editorWrap.appendChild(pre)
    editorWrap.appendChild(textarea)

    wrapper.appendChild(bar)
    wrapper.appendChild(editorWrap)

    // Store DOM refs for later access
    refsMap.set(wrapper, {
      textarea, pre, codeEl, copyBtn, editBtn,
      dropdown, dropdownTrigger, langLabel,
    })

    // Initial state
    if (code.trim() === '') {
      this.#switchToEdit(wrapper)
    } else {
      this.#switchToView(wrapper)
    }

    return wrapper
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ code: string, language: string }}
   */
  save(element) {
    const state = codeStateMap.get(element)
    if (state?.editMode) {
      const textarea = refsMap.get(element)?.textarea
      if (textarea) state.code = textarea.value
    }
    return {
      code: state?.code ?? '',
      language: state?.language ?? 'auto',
    }
  }

  /**
   * @param {{ code?: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return typeof data.code === 'string' && data.code.trim().length > 0
  }

  /**
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const state = codeStateMap.get(element)
    if (state?.editMode) {
      const textarea = refsMap.get(element)?.textarea
      return (textarea?.value?.trim().length ?? 0) === 0
    }
    return (state?.code?.trim().length ?? 0) === 0
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const data = this.save(element)
    return { text: data.code }
  }

  /**
   * @param {{ type: string, element?: HTMLElement, tag?: string, data?: string }} event
   * @returns {{ code: string, language: string } | null}
   */
  onPaste(event) {
    if (event.type === 'tag') {
      const code = event.element?.textContent || ''
      return { code: code.replace(/\n+$/, '\n'), language: 'auto' }
    }
    if (event.type === 'pattern') {
      return { code: event.data || '', language: 'auto' }
    }
    return null
  }

  /**
   * @param {HTMLElement} element
   */
  destroy(element) {
    const handler = docMousedownMap.get(element)
    if (handler) {
      document.removeEventListener('mousedown', handler)
    }
  }

  // ── Private: Edit/View mode ───────────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  #switchToEdit(wrapper) {
    const state = codeStateMap.get(wrapper)
    const refs = refsMap.get(wrapper)
    if (!state || !refs) return

    state.editMode = true
    wrapper.classList.add('oe-code-wrap--editing')

    refs.textarea.value = state.code
    refs.textarea.style.pointerEvents = ''
    refs.textarea.tabIndex = 0
    refs.textarea.removeAttribute('aria-hidden')

    refs.pre.style.pointerEvents = 'none'

    refs.editBtn.innerHTML = ICON_CHECK
    refs.editBtn.title = this._t('done', 'Done')

    refs.dropdown.style.display = ''
    refs.langLabel.style.display = 'none'

    this.#highlight(wrapper)
    refs.textarea.focus()
  }

  /** @param {HTMLElement} wrapper */
  #switchToView(wrapper) {
    const state = codeStateMap.get(wrapper)
    const refs = refsMap.get(wrapper)
    if (!state || !refs) return

    state.code = refs.textarea.value
    state.editMode = false
    wrapper.classList.remove('oe-code-wrap--editing')

    refs.textarea.style.pointerEvents = 'none'
    refs.textarea.tabIndex = -1
    refs.textarea.setAttribute('aria-hidden', 'true')

    refs.pre.style.pointerEvents = ''

    refs.editBtn.innerHTML = ICON_EDIT
    refs.editBtn.title = this._t('edit', 'Edit')

    refs.dropdown.style.display = 'none'
    this.#closeDropdown(wrapper)
    refs.langLabel.style.display = ''

    this.#highlight(wrapper)
  }

  // ── Private: Syntax highlighting ──────────────────────────────────────────

  /** @param {HTMLElement} wrapper */
  #highlight(wrapper) {
    highlightCodeBlock(wrapper)
  }

  /** @param {HTMLElement} wrapper */
  #syncScroll(wrapper) {
    const refs = refsMap.get(wrapper)
    if (!refs) return
    refs.pre.scrollTop = refs.textarea.scrollTop
    refs.pre.scrollLeft = refs.textarea.scrollLeft
  }

  // ── Private: Copy ─────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} wrapper
   * @param {HTMLElement} btn
   */
  #copy(wrapper, btn) {
    const code = codeStateMap.get(wrapper)?.code || ''
    if (!code) return

    void navigator.clipboard.writeText(code).then(() => {
      btn.innerHTML = ICON_CHECK
      btn.classList.add('oe-code-btn--copied')
      setTimeout(() => {
        btn.innerHTML = ICON_COPY
        btn.classList.remove('oe-code-btn--copied')
      }, 1800)
    }).catch(() => {
      // Clipboard API unavailable (HTTP without localhost)
    })
  }

  // ── Private: Keyboard ─────────────────────────────────────────────────────

  /**
   * @param {KeyboardEvent} e
   * @param {HTMLElement} wrapper
   * @param {HTMLTextAreaElement} textarea
   */
  #handleKeydown(e, wrapper, textarea) {
    const hkState = codeStateMap.get(wrapper)
    // Always stop propagation to prevent KeyboardManager from interfering
    // Exceptions: let Escape bubble after switching to view, let arrow keys
    // bubble at textarea boundaries for block navigation

    /* Tab → 4 spaces */
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      const s = textarea.selectionStart
      const end = textarea.selectionEnd
      const v = textarea.value
      if (s !== end && v.substring(s, end).includes('\n')) {
        const before = v.substring(0, s)
        const selected = v.substring(s, end)
        const after = v.substring(end)
        const lineStart = before.lastIndexOf('\n') + 1
        const prefix = before.substring(lineStart)
        const block = prefix + selected
        const indented = '    ' + block.replace(/\n/g, '\n    ')
        textarea.value = before.substring(0, lineStart) + indented + after
        textarea.selectionStart = lineStart
        textarea.selectionEnd = lineStart + indented.length
      } else {
        textarea.value = v.substring(0, s) + '    ' + v.substring(end)
        textarea.selectionStart = textarea.selectionEnd = s + 4
      }
      if (hkState) hkState.code = textarea.value
      this.#highlight(wrapper)
      return
    }

    /* Shift+Tab → dedent */
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      const s = textarea.selectionStart
      const v = textarea.value
      const lineStart = v.lastIndexOf('\n', s - 1) + 1
      const linePrefix = v.substring(lineStart, lineStart + 4)
      if (linePrefix === '    ') {
        textarea.value = v.substring(0, lineStart) + v.substring(lineStart + 4)
        textarea.selectionStart = textarea.selectionEnd = Math.max(s - 4, lineStart)
      }
      if (hkState) hkState.code = textarea.value
      this.#highlight(wrapper)
      return
    }

    /* Ctrl+Enter / Cmd+Enter → view mode */
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      e.stopPropagation()
      this.#switchToView(wrapper)
      wrapper.focus()
      return
    }

    /* Escape → view mode */
    if (e.key === 'Escape') {
      e.stopPropagation()
      this.#switchToView(wrapper)
      wrapper.focus()
      return
    }

    /* Enter → normal newline inside textarea */
    if (e.key === 'Enter') {
      e.stopPropagation()
      // Don't prevent default — let textarea handle newline naturally
      // Update state after browser inserts newline
      requestAnimationFrame(() => {
        if (hkState) hkState.code = textarea.value
        this.#highlight(wrapper)
      })
      return
    }

    /* Backspace → if empty, let it bubble to delete the block */
    if (e.key === 'Backspace') {
      if (textarea.value === '') {
        // Don't stop propagation — KeyboardManager will handle block removal
        return
      }
      e.stopPropagation()
      requestAnimationFrame(() => {
        if (hkState) hkState.code = textarea.value
        this.#highlight(wrapper)
      })
      return
    }

    /* Delete → same logic */
    if (e.key === 'Delete') {
      if (textarea.value === '') {
        return
      }
      e.stopPropagation()
      requestAnimationFrame(() => {
        if (hkState) hkState.code = textarea.value
        this.#highlight(wrapper)
      })
      return
    }

    /* ArrowUp at first line → let it bubble for block navigation */
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      const before = textarea.value.substring(0, textarea.selectionStart)
      if (!before.includes('\n')) {
        // First line — let KeyboardManager navigate to previous block
        return
      }
      e.stopPropagation()
      return
    }

    /* ArrowDown at last line → let it bubble for block navigation */
    if (e.key === 'ArrowDown' && !e.shiftKey) {
      const after = textarea.value.substring(textarea.selectionEnd)
      if (!after.includes('\n')) {
        // Last line — let KeyboardManager navigate to next block
        return
      }
      e.stopPropagation()
      return
    }

    // Let modifier combos (Ctrl+Z, Ctrl+A, etc.) bubble to ShortcutRegistry
    if (e.ctrlKey || e.metaKey) return
    // All other keys — stop propagation to prevent KeyboardManager
    e.stopPropagation()

    // Update highlight for any content changes
    requestAnimationFrame(() => {
      if (hkState) hkState.code = textarea.value
      this.#highlight(wrapper)
    })
  }

  // ── Private: Language dropdown ─────────────────────────────────────────────

  /**
   * @param {HTMLElement} wrapper
   * @returns {{ dropdown: HTMLElement, trigger: HTMLElement, langLabel: HTMLElement }}
   */
  #buildDropdown(wrapper) {
    const dropdown = document.createElement('div')
    dropdown.className = 'oe-code-dropdown'

    const state = /** @type {NonNullable<ReturnType<typeof codeStateMap.get>>} */ (codeStateMap.get(wrapper))

    // Trigger button
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'oe-code-dropdown__trigger'
    const currentLang = LANGUAGES.find(l => l.value === state.language)
    trigger.textContent = currentLang ? currentLang.label : state.language

    trigger.addEventListener('click', (e) => {
      e.stopPropagation()
      if (dropdown.classList.contains('oe-code-dropdown--open')) {
        this.#closeDropdown(wrapper)
      } else {
        this.#openDropdown(wrapper)
      }
    })

    // Panel
    const panel = document.createElement('div')
    panel.className = 'oe-code-dropdown__panel'

    // Search input
    const search = document.createElement('input')
    search.type = 'text'
    search.className = 'oe-code-dropdown__search'
    search.placeholder = this._t('search', 'Search...')
    search.autocomplete = 'off'

    // List (created before search listeners that reference it)
    const list = document.createElement('div')
    list.className = 'oe-code-dropdown__list'

    let focusedIndex = -1

    search.addEventListener('input', () => {
      filterDropdownItems(list, search.value)
      focusedIndex = -1
      clearDropdownFocus(list)
    })

    search.addEventListener('keydown', (e) => {
      // Let modifier combos (Ctrl+Z, Ctrl+A, etc.) bubble to ShortcutRegistry
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
      if (e.key === 'Escape') {
        this.#closeDropdown(wrapper)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        focusedIndex = moveDropdownFocus(list, focusedIndex, 1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        focusedIndex = moveDropdownFocus(list, focusedIndex, -1)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const visible = getVisibleItems(list)
        if (focusedIndex >= 0 && focusedIndex < visible.length) {
          const value = visible[focusedIndex]?.dataset.value
          if (value) this.#selectLanguage(wrapper, value)
        }
      }
    })

    for (const lang of LANGUAGES) {
      const item = document.createElement('div')
      item.className = 'oe-code-dropdown__item'
      if (lang.value === state.language) item.classList.add('oe-code-dropdown__item--active')
      item.dataset.value = lang.value
      item.textContent = lang.label
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        this.#selectLanguage(wrapper, lang.value)
      })
      list.appendChild(item)
    }

    panel.appendChild(list)
    dropdown.appendChild(trigger)
    dropdown.appendChild(panel)

    // Store refs for open/close
    dropdownRefsMap.set(dropdown, { panel, search, list, trigger, focusedIndex })

    // Language label (view mode)
    const langLabel = document.createElement('span')
    langLabel.className = 'oe-code-lang'
    const labelLang = LANGUAGES.find(l => l.value === state.language)
    langLabel.textContent = labelLang ? labelLang.label : state.language

    // Close on outside click
    const onDocMousedown = (/** @type {MouseEvent} */ e) => {
      if (!dropdown.contains(/** @type {Node} */ (e.target))) {
        this.#closeDropdown(wrapper)
      }
    }
    document.addEventListener('mousedown', onDocMousedown)
    docMousedownMap.set(wrapper, onDocMousedown)

    return { dropdown, trigger, langLabel }
  }

  /** @param {HTMLElement} wrapper */
  #openDropdown(wrapper) {
    const dropdown = refsMap.get(wrapper)?.dropdown
    if (!dropdown) return
    const drefs = dropdownRefsMap.get(dropdown)
    if (!drefs) return

    drefs.panel.prepend(drefs.search)
    dropdown.classList.add('oe-code-dropdown--open')
    drefs.search.value = ''
    filterDropdownItems(drefs.list, '')
    drefs.focusedIndex = -1
    clearDropdownFocus(drefs.list)
    drefs.search.focus()
  }

  /** @param {HTMLElement} wrapper */
  #closeDropdown(wrapper) {
    const dropdown = refsMap.get(wrapper)?.dropdown
    if (!dropdown) return
    const drefs = dropdownRefsMap.get(dropdown)
    if (!drefs) return

    dropdown.classList.remove('oe-code-dropdown--open')
    drefs.search.remove()
    drefs.focusedIndex = -1
    clearDropdownFocus(drefs.list)
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} value
   */
  #selectLanguage(wrapper, value) {
    const state = codeStateMap.get(wrapper)
    const refs = refsMap.get(wrapper)
    if (!state || !refs) return

    state.language = value
    wrapper.dataset.lang = value

    // Update trigger text
    const dropdown = refs.dropdown
    const drefs = dropdown ? dropdownRefsMap.get(dropdown) : undefined
    if (drefs?.trigger) {
      const lang = LANGUAGES.find(l => l.value === value)
      drefs.trigger.textContent = lang ? lang.label : value
    }

    // Update lang label
    if (refs.langLabel) {
      const lang = LANGUAGES.find(l => l.value === value)
      refs.langLabel.textContent = lang ? lang.label : value
    }

    // Update active state in list
    if (drefs?.list) {
      for (const item of drefs.list.children) {
        item.classList.toggle('oe-code-dropdown__item--active', /** @type {HTMLElement} */ (item).dataset.value === value)
      }
    }

    this.#highlight(wrapper)
    this.#closeDropdown(wrapper)
    wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
  }

}
