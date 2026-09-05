import { getHighlightRuntime, loadHighlightRuntime } from '../../shared/highlightRuntime.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateCodeData } from '../../shared/blockDataValidators.js'
import { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../../core/constants.js'

const editorStyles = new URL('./code.css', import.meta.url).href

/** @type {WeakMap<HTMLElement, {code: string, language: string, editMode: boolean, context: import('../../core/types').BlockMutationContext, copyResetTimer: ReturnType<typeof setTimeout> | null}>} */
const codeStateMap = new WeakMap()

/** @type {WeakMap<HTMLElement, {textarea: HTMLTextAreaElement, pre: HTMLPreElement, codeEl: HTMLElement, copyBtn: HTMLElement, editBtn: HTMLElement, dropdown: HTMLElement, langLabel: HTMLElement}>} */
const refsMap = new WeakMap()

/** @type {WeakMap<HTMLElement, (e: MouseEvent) => void>} */
const docMousedownMap = new WeakMap()

/** @type {WeakMap<HTMLElement, {panel: HTMLElement, search: HTMLInputElement, list: HTMLElement, trigger: HTMLElement}>} */
const dropdownRefsMap = new WeakMap()

let dropdownSequence = 0

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

/**
 * Highlight a code block wrapper using hljs (if loaded).
 * @param {HTMLElement} wrapper
 * @param {import('../../shared/highlightRuntime').HighlightRuntime | null} hljs
 */
function highlightCodeBlock(wrapper, hljs) {
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

  if (!hljs) {
    codeEl.classList.add('hljs')
    return
  }

  try {
    if (lang === 'auto') {
      const result = hljs.highlightAuto(code)
      if (result.language) {
        codeEl.innerHTML = result.value + '\n'
        codeEl.classList.add('hljs', 'language-' + result.language)
      } else {
        codeEl.classList.add('hljs')
      }
    } else if (hljs.getLanguage(lang)) {
      const result = hljs.highlight(code, { language: lang, ignoreIllegals: true })
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


/**
 * @typedef {Object} CodeConfig
 * @property {import('../../shared/highlightRuntime').HighlightRuntime} [hljs] Application-supplied highlight.js-compatible runtime. The bundled runtime is loaded lazily when omitted.
 * @property {boolean} [injectStyles=true] Whether the editor should load the built-in plugin stylesheet.
 * @property {string} [css] Additional or replacement stylesheet URL, depending on `injectStyles`.
 */

/**
 * Editable source-code block with language selection and optional syntax highlighting.
 * @extends {BlockPluginAbstract<CodeConfig>}
 */
export class Code extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'code'
  icon = ICON
  inlineTools = false

  #highlightRuntime = null
  /** @type {Set<HTMLElement>} */
  #wrappers = new Set()
  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Code')
  }

  /**
   * Create a Code instance with the supplied consumer configuration.
   * @param {CodeConfig} [config]
   */
  constructor(config) {
    super(config)
    this.#highlightRuntime = config?.hljs ?? getHighlightRuntime()

    if (!this.#highlightRuntime) {
      // The bundled runtime is shared and immutable, while mounted blocks remain
      // owned by this plugin instance. A custom runtime never leaks to another editor.
      void loadHighlightRuntime().then(runtime => {
        this.#highlightRuntime = runtime
        for (const wrapper of this.#wrappers) {
          highlightCodeBlock(wrapper, runtime)
        }
      }).catch(function (err) {
        console.warn('[Code] Failed to load local highlight.js:', err)
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
   * Create the editable DOM owned by this block instance.
   * @param {{ code?: string, language?: string }} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const code = typeof data.code === 'string' ? data.code : ''
    const language = typeof data.language === 'string' && data.language
      ? data.language
      : 'auto'

    // ── Wrapper (non-editable, focusable) ──
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-code-wrap')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1
    wrapper.dataset.lang = language

    // State stored via WeakMap for save()
    codeStateMap.set(wrapper, { code, language, editMode: false, context, copyResetTimer: null })
    this.#wrappers.add(wrapper)

    // ── Header bar ──
    const bar = document.createElement('div')
    bar.className = 'oe-code-bar'

    const dots = document.createElement('span')
    dots.className = 'oe-code-dots'
    dots.innerHTML = '<span></span><span></span><span></span>'

    const { dropdown, langLabel } = this.#buildDropdown(wrapper)

    const copyBtn = document.createElement('button')
    copyBtn.className = 'oe-code-btn oe-code-btn--copy'
    copyBtn.type = 'button'
    copyBtn.title = this._t('copy', 'Copy')
    copyBtn.setAttribute('aria-label', copyBtn.title)
    copyBtn.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
    copyBtn.innerHTML = ICON_COPY
    copyBtn.addEventListener('click', () => this.#copy(wrapper, copyBtn))

    const editBtn = document.createElement('button')
    editBtn.className = 'oe-code-btn oe-code-btn--edit'
    editBtn.type = 'button'
    editBtn.title = this._t('edit', 'Edit')
    editBtn.setAttribute('aria-label', editBtn.title)
    editBtn.innerHTML = ICON_EDIT
    editBtn.hidden = context.readOnly
    editBtn.disabled = context.readOnly
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
    textarea.setAttribute('data-oe-document-input', '')
    textarea.className = 'oe-code-textarea'
    textarea.placeholder = this._t('placeholder', '// Write code...')
    textarea.spellcheck = false
    textarea.readOnly = context.readOnly
    textarea.value = code

    textarea.addEventListener('input', () => {
      const st = codeStateMap.get(wrapper)
      if (st) st.code = textarea.value
      this.#syncScroll(wrapper)
      this.#highlight(wrapper)
    })

    textarea.addEventListener('paste', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const st = codeStateMap.get(wrapper)
      st?.context.mutate(() => {
        const text = /** @type {ClipboardEvent} */ (e).clipboardData?.getData('text/plain') || ''
        const s = textarea.selectionStart
        const end = textarea.selectionEnd
        textarea.value = textarea.value.substring(0, s) + text + textarea.value.substring(end)
        textarea.selectionStart = textarea.selectionEnd = s + text.length
        st.code = textarea.value
        this.#highlight(wrapper)
      })
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
      dropdown, langLabel,
    })

    // Initial state
    if (code.trim() === '' && !context.readOnly) {
      this.#switchToEdit(wrapper)
    } else {
      this.#switchToView(wrapper)
    }

    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
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
   * Check whether serialized data satisfies this block's schema.
   * @param {{ code?: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return validateCodeData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
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
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const data = this.save(element)
    return { text: data.code }
  }

  /**
   * Handle supported pasted content for this block.
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
   * Release listeners and resources owned by this block element.
   * @param {HTMLElement} element
   * @returns {void}
   */
  destroy(element) {
    this.#wrappers.delete(element)
    const state = codeStateMap.get(element)
    if (state?.copyResetTimer) clearTimeout(state.copyResetTimer)
    const handler = docMousedownMap.get(element)
    if (handler) {
      document.removeEventListener('mousedown', handler)
    }
  }

  // ── Private: Edit/View mode ───────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  #switchToEdit(wrapper) {
    const state = codeStateMap.get(wrapper)
    const refs = refsMap.get(wrapper)
    if (!state || !refs || state.context.readOnly) return

    state.editMode = true
    wrapper.classList.add('oe-code-wrap--editing')

    refs.textarea.value = state.code
    refs.textarea.style.pointerEvents = ''
    refs.textarea.tabIndex = 0
    refs.textarea.removeAttribute('aria-hidden')

    refs.pre.style.pointerEvents = 'none'

    refs.editBtn.innerHTML = ICON_CHECK
    refs.editBtn.title = this._t('done', 'Done')
    refs.editBtn.setAttribute('aria-label', refs.editBtn.title)

    refs.dropdown.style.display = ''
    refs.langLabel.style.display = 'none'

    this.#highlight(wrapper)
    refs.textarea.focus()
  }

  /** @param {HTMLElement} wrapper @returns {void} */
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
    refs.editBtn.setAttribute('aria-label', refs.editBtn.title)

    refs.dropdown.style.display = 'none'
    this.#closeDropdown(wrapper)
    refs.langLabel.style.display = ''

    this.#highlight(wrapper)
  }

  // ── Private: Syntax highlighting ──────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  #highlight(wrapper) {
    highlightCodeBlock(wrapper, this.#highlightRuntime)
  }

  /** @param {HTMLElement} wrapper @returns {void} */
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
   * @returns {void}
   */
  #copy(wrapper, btn) {
    const state = codeStateMap.get(wrapper)
    const code = state?.code || ''
    if (!code) return

    const writeText = navigator.clipboard?.writeText
    if (typeof writeText !== 'function') return

    void writeText.call(navigator.clipboard, code).then(() => {
      if (!codeStateMap.has(wrapper)) return
      btn.innerHTML = ICON_CHECK
      btn.classList.add('oe-code-btn--copied')
      if (state?.copyResetTimer) clearTimeout(state.copyResetTimer)
      const timer = setTimeout(() => {
        if (state) state.copyResetTimer = null
        if (!codeStateMap.has(wrapper)) return
        btn.innerHTML = ICON_COPY
        btn.classList.remove('oe-code-btn--copied')
      }, 1800)
      if (state) state.copyResetTimer = timer
    }).catch(() => {
      // Clipboard API unavailable (HTTP without localhost)
    })
  }

  // ── Private: Keyboard ─────────────────────────────────────────────────────

  /**
   * @param {KeyboardEvent} e
   * @param {HTMLElement} wrapper
   * @param {HTMLTextAreaElement} textarea
   * @returns {void}
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
      hkState?.context.mutate(() => {
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
        hkState.code = textarea.value
        this.#highlight(wrapper)
      })
      return
    }

    /* Shift+Tab → dedent */
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      hkState?.context.mutate(() => {
        const s = textarea.selectionStart
        const end = textarea.selectionEnd
        const v = textarea.value
        const lineStart = v.lastIndexOf('\n', s - 1) + 1
        const selected = v.substring(lineStart, end)
        const dedented = selected.replace(/^ {1,4}/gm, '')
        if (selected === dedented) return
        const firstIndent = selected.match(/^ {1,4}/)?.[0].length ?? 0
        textarea.value = v.substring(0, lineStart) + dedented + v.substring(end)
        textarea.selectionStart = Math.max(lineStart, s - firstIndent)
        textarea.selectionEnd = end > s
          ? lineStart + dedented.length
          : textarea.selectionStart
        hkState.code = textarea.value
        this.#highlight(wrapper)
      })
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

  /** @param {{ value: string, label: string } | undefined} language @returns {string} */
  #languageLabel(language) {
    if (!language) return ''
    if (language.value === 'auto') return this._t('languageAuto', language.label)
    if (language.value === 'plaintext') return this._t('languagePlainText', language.label)
    return language.label
  }

  /**
   * @param {HTMLElement} wrapper
   * @returns {{ dropdown: HTMLElement, trigger: HTMLElement, langLabel: HTMLElement }}
   */
  #buildDropdown(wrapper) {
    const dropdown = document.createElement('div')
    dropdown.className = 'oe-code-dropdown'
    const dropdownId = `oe-code-dropdown-${++dropdownSequence}`

    const state = /** @type {NonNullable<ReturnType<typeof codeStateMap.get>>} */ (codeStateMap.get(wrapper))

    // Trigger button
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'oe-code-dropdown__trigger'
    trigger.setAttribute('aria-haspopup', 'listbox')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.setAttribute('aria-controls', `${dropdownId}-panel`)
    const currentLang = LANGUAGES.find(l => l.value === state.language)
    trigger.textContent = currentLang ? this.#languageLabel(currentLang) : state.language

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
    panel.id = `${dropdownId}-panel`

    // Search input
    const search = document.createElement('input')
    search.type = 'text'
    search.className = 'oe-code-dropdown__search'
    search.placeholder = this._t('search', 'Search...')
    search.setAttribute('aria-label', this._t('search', 'Search...'))
    search.setAttribute('role', 'combobox')
    search.setAttribute('aria-autocomplete', 'list')
    search.setAttribute('aria-expanded', 'false')
    search.setAttribute('aria-controls', `${dropdownId}-list`)
    search.autocomplete = 'off'

    // List (created before search listeners that reference it)
    const list = document.createElement('div')
    list.className = 'oe-code-dropdown__list'
    list.id = `${dropdownId}-list`
    list.setAttribute('role', 'listbox')

    let focusedIndex = -1

    search.addEventListener('input', () => {
      filterDropdownItems(list, search.value)
      focusedIndex = -1
      clearDropdownFocus(list)
      search.removeAttribute('aria-activedescendant')
    })

    search.addEventListener('keydown', (e) => {
      // Let modifier combos (Ctrl+Z, Ctrl+A, etc.) bubble to ShortcutRegistry
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        this.#closeDropdown(wrapper, true)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        focusedIndex = moveDropdownFocus(list, focusedIndex, 1)
        const focused = getVisibleItems(list)[focusedIndex]
        if (focused?.id) search.setAttribute('aria-activedescendant', focused.id)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        focusedIndex = moveDropdownFocus(list, focusedIndex, -1)
        const focused = getVisibleItems(list)[focusedIndex]
        if (focused?.id) search.setAttribute('aria-activedescendant', focused.id)
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
      item.setAttribute('role', 'option')
      item.id = `${dropdownId}-option-${lang.value}`
      item.setAttribute('aria-selected', String(lang.value === state.language))
      item.dataset.value = lang.value
      item.textContent = this.#languageLabel(lang)
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
    dropdownRefsMap.set(dropdown, { panel, search, list, trigger })

    // Language label (view mode)
    const langLabel = document.createElement('span')
    langLabel.className = 'oe-code-lang'
    const labelLang = LANGUAGES.find(l => l.value === state.language)
    langLabel.textContent = labelLang ? this.#languageLabel(labelLang) : state.language

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

  /** @param {HTMLElement} wrapper @returns {void} */
  #openDropdown(wrapper) {
    const dropdown = refsMap.get(wrapper)?.dropdown
    if (!dropdown) return
    const drefs = dropdownRefsMap.get(dropdown)
    if (!drefs) return

    drefs.panel.prepend(drefs.search)
    dropdown.classList.add('oe-code-dropdown--open')
    drefs.trigger.setAttribute('aria-expanded', 'true')
    drefs.search.setAttribute('aria-expanded', 'true')
    drefs.search.value = ''
    filterDropdownItems(drefs.list, '')
    clearDropdownFocus(drefs.list)
    drefs.search.focus()
  }

  /** @param {HTMLElement} wrapper @param {boolean} [restoreFocus=false] @returns {void} */
  #closeDropdown(wrapper, restoreFocus = false) {
    const dropdown = refsMap.get(wrapper)?.dropdown
    if (!dropdown) return
    const drefs = dropdownRefsMap.get(dropdown)
    if (!drefs) return

    dropdown.classList.remove('oe-code-dropdown--open')
    drefs.trigger.setAttribute('aria-expanded', 'false')
    drefs.search.setAttribute('aria-expanded', 'false')
    drefs.search.removeAttribute('aria-activedescendant')
    drefs.search.remove()
    clearDropdownFocus(drefs.list)
    if (restoreFocus) drefs.trigger.focus()
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} value
   * @returns {void}
   */
  #selectLanguage(wrapper, value) {
    const state = codeStateMap.get(wrapper)
    const refs = refsMap.get(wrapper)
    if (!state || !refs) return

    state.context.mutate(() => {
      state.language = value
      wrapper.dataset.lang = value

      // Update trigger text
      const dropdown = refs.dropdown
      const drefs = dropdown ? dropdownRefsMap.get(dropdown) : undefined
      if (drefs?.trigger) {
        const lang = LANGUAGES.find(l => l.value === value)
        drefs.trigger.textContent = lang ? this.#languageLabel(lang) : value
      }

      // Update lang label
      if (refs.langLabel) {
        const lang = LANGUAGES.find(l => l.value === value)
        refs.langLabel.textContent = lang ? this.#languageLabel(lang) : value
      }

      // Update active state in list
      if (drefs?.list) {
        for (const item of drefs.list.children) {
          const selected = /** @type {HTMLElement} */ (item).dataset.value === value
          item.classList.toggle('oe-code-dropdown__item--active', selected)
          item.setAttribute('aria-selected', String(selected))
        }
      }

      this.#highlight(wrapper)
      this.#closeDropdown(wrapper, true)
    })
  }

}
