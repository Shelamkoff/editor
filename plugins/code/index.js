// @ts-check
import { READ_ONLY_INTERACTIVE_ATTRIBUTE, setSanitizedHtml } from '../../plugin-kit/index.js'
import { setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { codeDataSchema } from '../../shared/blockSchemas/code.js'
import { getHighlightRuntime, loadHighlightRuntime } from '../../shared/highlightRuntime.js'
import { dedentTextarea } from '../shared/dedentTextarea.js'
import { indentTextarea } from '../shared/indentTextarea.js'
import { createLanguageMenu } from './languageMenu.js'

const editorStyles = new URL('./code.css', import.meta.url).href
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 8l-4 4l4 4"/><path d="M17 8l4 4l-4 4"/><path d="M14 4l-4 16"/></svg>'
const COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
const EDIT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4z"/></svg>'

// Keep Code's text-Paste recognition aligned with v1; normal prose must not
// be claimed by overly broad language prefixes. HTML <pre>/<code> roots are
// handled independently by the htmlImport capability.
const CODE_PASTE_PATTERNS = Object.freeze([
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
])

function selectedPayloadText(payload,ownerDocument){
  if((payload?.kind!=='plain-text'&&payload?.kind!=='rich-text')||typeof payload.data?.text!=='string')throw new TypeError('Code can only join textual payloads')
  if(payload.kind==='plain-text')return payload.data.text
  if(!ownerDocument?.createElement)throw new TypeError('Code rich-text conversion requires an owning document')
  const template=ownerDocument.createElement('template')
  setSanitizedHtml(template,payload.data.text)
  for(const lineBreak of template.content.querySelectorAll('br'))lineBreak.replaceWith(ownerDocument.createTextNode('\n'))
  return template.content.textContent??''
}

function highlight(element, code, language, runtime, isCurrent) {
  const className = language === 'auto' ? '' : 'language-' + language
  try {
    let html, detectedClass
    if (runtime) {
      if (language === 'auto') {
        const result = runtime.highlightAuto(code)
        if (!isCurrent()) return
        html = result.value + '\n'
        if (!isCurrent()) return
        const detected = result.language
        if (detected) detectedClass = 'language-' + detected
      } else {
        const supported = runtime.getLanguage(language)
        if (!isCurrent()) return
        if (supported) {
          const result = runtime.highlight(code, { language, ignoreIllegals: true })
          if (!isCurrent()) return
          html = result.value + '\n'
        }
      }
    }
    // A compatible provider may synchronously update data or retire its
    // editor. Publish only the still-current presentation after that callback.
    if (!isCurrent()) return
    element.className = className
    if (html === undefined) element.textContent = code + '\n'
    else setTrustedHtml(element, html)
    element.classList.add('hljs')
    if (detectedClass) element.classList.add(detectedClass)
  } catch {
    if (!isCurrent()) return
    element.className = className
    element.textContent = code + '\n'
    element.classList.add('hljs')
  }
}

/**
 * Create an immutable Code block definition with optional syntax-highlighting runtime and stylesheet configuration.
 * @param {{hljs?: import('../../shared/highlightRuntime').HighlightRuntime, injectStyles?: boolean, css?: string}} [config]
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{code:string,language:string}>}
 */
export function createCodePlugin(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Code configuration must be an object')
  const snapshot = Object.freeze({ ...config })
  const styles = []
  if (snapshot.injectStyles !== false) styles.push(editorStyles)
  if (snapshot.css) styles.push(snapshot.css)

  const capabilities = Object.freeze({
    empty: Object.freeze({ isEmpty: data => data.code.trim().length === 0 }),
    conversion: Object.freeze({
      selectionMode:'single',
      joinSelection(payloads,context){
        return {kind:'plain-text',data:{text:payloads.map(payload=>selectedPayloadText(payload,context.ownerDocument)).join('\n')}}
      },
      export: data => ({ kind: 'plain-text', data: { text: data.code } }),
      canImport: payload => (payload?.kind === 'plain-text' || payload?.kind === 'rich-text') && typeof payload.data?.text === 'string',
      import(payload,context) {
        return { code: selectedPayloadText(payload,context?.ownerDocument), language: 'auto' }
      },
    }),
    htmlImport: Object.freeze({
      matchesRoot(element) {
        return element.tagName === 'PRE' || element.tagName === 'CODE'
      },
      importRoot(element) {
        // V1 captures the entire preformatted root, including text siblings
        // of a nested <code> element. Selecting only <code> silently drops text.
        return { code: (element.textContent ?? '').replace(/\n+$/, '\n'), language: 'auto' }
      },
    }),
    paste: Object.freeze({
      accepts(input) {
        return input.kind === 'text' && CODE_PASTE_PATTERNS.some(pattern => pattern.test(input.text))
      },
      resolve(input) {
        return input.kind === 'text'
          ? { kind: /** @type {'block'} */ ('block'), data: { code: input.text, language: 'auto' } }
          : null
      },
    }),
  })

  return Object.freeze({
    type: 'code',
    label: Object.freeze({ key: 'title', fallback: 'Code' }),
    icon: ICON,
    styles: Object.freeze(styles),
    schema: codeDataSchema,
    capabilities,
    setup(runtimeContext) {
      let destroyed = false
      let runtime = snapshot.hljs ?? getHighlightRuntime()
      const refreshers = new Set()
      if (!runtime) {
        void loadHighlightRuntime().then(loaded => {
          if (destroyed || runtimeContext.signal.aborted) return
          runtime = loaded
          for (const refresh of refreshers) refresh()
        }).catch(error => {
          if (!runtimeContext.signal.aborted) console.warn('[Code] Failed to load highlight runtime', error)
        })
      }
      return {
        create(initial, context) {
          if (destroyed) throw new Error('Code runtime is destroyed')
          const document = context.ownerDocument
          const wrapper = document.createElement('div')
          wrapper.className = 'oe-code-wrap'
          wrapper.contentEditable = 'false'
          wrapper.tabIndex = -1
          const bar = document.createElement('div')
          bar.className = 'oe-code-bar'
          const language = createLanguageMenu(context, (key, fallback) => runtimeContext.t(key, fallback), value => {
            if (!readOnly && !dead) context.updateData(current => ({ ...current, language: value }))
          })
          const copy = document.createElement('button')
          copy.type = 'button'
          copy.className = 'oe-code-btn oe-code-btn--copy'
          copy.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
          copy.setAttribute('aria-label', runtimeContext.t('copy', 'Copy'))
          setTrustedHtml(copy, COPY_ICON)
          const edit = document.createElement('button')
          edit.type = 'button'
          edit.className = 'oe-code-btn oe-code-btn--edit'
          bar.append(language.element, copy, edit)

          const editor = document.createElement('div')
          editor.className = 'oe-code-editor'
          const pre = document.createElement('pre')
          pre.className = 'oe-code-pre'
          const codeElement = document.createElement('code')
          pre.appendChild(codeElement)
          const textarea = document.createElement('textarea')
          textarea.className = 'oe-code-textarea'
          textarea.setAttribute('data-oe-document-input', '')
          textarea.placeholder = runtimeContext.t('placeholder', '// Write code...')
          textarea.spellcheck = false
          editor.append(pre, textarea)
          wrapper.append(bar, editor)

          let data = { ...initial }
          let readOnly = context.isReadOnly()
          let editMode = !readOnly && !initial.code.trim()
          let dead = false
          let copyResetTimer = null
          const timerHost = document.defaultView ?? globalThis
          const ownsCopyButton = () => !dead && !context.signal.aborted
            && copy.parentNode === bar && bar.parentNode === wrapper
          const canUpdateCopyFeedback = () => {
            if (!ownsCopyButton()) return false
            // Reuse the core's original block-owner admission for a late
            // presentation; local parent checks alone cannot prove its root.
            try { context.getData() } catch { return false }
            return ownsCopyButton()
          }
          let highlightRevision = 0
          const refresh = () => {
            if (dead || context.signal.aborted) return
            const revision = ++highlightRevision, text = textarea.value, language = data.language
            const matchesRefresh = () => ownsHighlightView() && highlightRevision === revision
              && textarea.value === text && data.language === language
            highlight(codeElement, text, language, runtime, () => {
              if (!matchesRefresh()) return false
              // The provider can adopt the whole block while keeping its
              // internal parents intact. Recheck the original core owner too.
              try { context.getData() } catch { return false }
              return matchesRefresh()
            })
          }
          const ownsHighlightView = () => !dead && !context.signal.aborted
            && codeElement.parentNode === pre && pre.parentNode === editor
            && textarea.parentNode === editor && editor.parentNode === wrapper
          const refreshAfterLoad = () => {
            if (!ownsHighlightView()) return
            // Admit the late loader before it invokes the provider too.
            // Synchronous projection keeps its existing fallible refresh.
            try { context.getData() } catch { return }
            if (ownsHighlightView()) refresh()
          }
          const mode = () => {
            wrapper.classList.toggle('oe-code-wrap--editing', editMode && !readOnly)
            textarea.hidden = !(editMode && !readOnly)
            pre.hidden = false
            pre.style.pointerEvents = editMode && !readOnly ? 'none' : ''
            textarea.tabIndex = editMode && !readOnly ? 0 : -1
            textarea.setAttribute('aria-hidden', String(!(editMode && !readOnly)))
            edit.hidden = readOnly
            edit.disabled = readOnly
            edit.title = editMode && !readOnly ? runtimeContext.t('done', 'Done') : runtimeContext.t('edit', 'Edit')
            edit.setAttribute('aria-label', edit.title)
            setTrustedHtml(edit, editMode && !readOnly ? CHECK_ICON : EDIT_ICON)
            language.setEditable(editMode && !readOnly)
            textarea.readOnly = readOnly
          }
          const project = next => {
            data = { ...next }
            if (textarea.value !== next.code) textarea.value = next.code
            language.update(next.language)
            refresh()
            mode()
          }
          refreshers.add(refreshAfterLoad)
          project(data)

          edit.addEventListener('click', () => {
            if (readOnly || dead) return
            editMode = !editMode
            mode()
            if (editMode) textarea.focus()
          }, { signal: context.signal })
          pre.addEventListener('click', () => {
            if (readOnly || dead) return
            editMode = true
            mode()
            textarea.focus()
          }, { signal: context.signal })
          copy.addEventListener('click', () => {
            if (dead) return
            const source = context.getData().code
            if (!source) return
            const clipboard = document.defaultView?.navigator?.clipboard
            if (typeof clipboard?.writeText !== 'function') return
            void clipboard.writeText(source).then(() => {
              if (!canUpdateCopyFeedback()) return
              setTrustedHtml(copy, CHECK_ICON)
              copy.classList.add('oe-code-btn--copied')
              if (copyResetTimer !== null) timerHost.clearTimeout(copyResetTimer)
              copyResetTimer = timerHost.setTimeout(() => {
                copyResetTimer = null
                if (!canUpdateCopyFeedback()) return
                setTrustedHtml(copy, COPY_ICON)
                copy.classList.remove('oe-code-btn--copied')
              }, 1800)
            }).catch(() => {})
          }, { signal: context.signal })
          textarea.addEventListener('input', refresh, { signal: context.signal })
          textarea.addEventListener('scroll', () => {
            pre.scrollTop = textarea.scrollTop
            pre.scrollLeft = textarea.scrollLeft
          }, { signal: context.signal })
          textarea.addEventListener('keydown', event => {
            if (readOnly) return
            if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
              event.preventDefault()
              event.stopPropagation()
              editMode = false
              mode()
              wrapper.focus()
              return
            }
            if (event.key === 'Enter') event.stopPropagation()
            if (event.key !== 'Tab') return
            event.preventDefault()
            event.stopPropagation()
            context.commitDomMutation(() => {
              if (event.shiftKey) dedentTextarea(textarea, 4)
              else indentTextarea(textarea, 4)
              refresh()
            })
          }, { signal: context.signal })

          return {
            element: wrapper,
            read: () => ({ code: textarea.value, language: data.language }),
            update(next) { if (!dead) project(next) },
            editableFields: () => Object.freeze([Object.freeze({ key: 'code', element: textarea, mode: /** @type {'plain-text'} */ ('plain-text') })]),
            setReadOnly(value) { readOnly = value; if (value) editMode = false; mode() },
            focus() { if (!dead && !readOnly) { editMode = true; mode(); textarea.focus() } },
            destroy() {
              if (dead) return
              dead = true
              language.destroy()
              refreshers.delete(refreshAfterLoad)
              if (copyResetTimer !== null) {
                timerHost.clearTimeout(copyResetTimer)
                copyResetTimer = null
              }
            },
          }
        },
        destroy() { destroyed = true; refreshers.clear() },
      }
    },
  })
}
