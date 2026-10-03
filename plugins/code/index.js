// @ts-check
import { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../../plugin-kit/index.js'
import { setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { codeDataSchema } from '../../shared/blockSchemas/code.js'
import { getHighlightRuntime, loadHighlightRuntime } from '../../shared/highlightRuntime.js'
import { dedentTextarea } from '../shared/dedentTextarea.js'

const editorStyles = new URL('./code.css', import.meta.url).href
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 8l-4 4l4 4"/><path d="M17 8l4 4l-4 4"/><path d="M14 4l-4 16"/></svg>'
const COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
const LANGUAGES = Object.freeze(['auto','javascript','typescript','php','python','html','css','scss','json','sql','bash','shell','go','rust','java','kotlin','swift','c','cpp','csharp','xml','yaml','toml','markdown','docker','nginx','plaintext'])

function highlight(element, code, language, runtime) {
  element.className = language === 'auto' ? '' : 'language-' + language
  if (!runtime) {
    element.textContent = code + '\n'
    element.classList.add('hljs')
    return
  }
  try {
    if (language !== 'auto' && runtime.getLanguage(language)) {
      const result = runtime.highlight(code, { language, ignoreIllegals: true })
      setTrustedHtml(element, result.value + '\n')
      element.classList.add('hljs', 'language-' + language)
      return
    }
    const result = runtime.highlightAuto(code)
    setTrustedHtml(element, result.value + '\n')
    element.classList.add('hljs')
    if (result.language) element.classList.add('language-' + result.language)
  } catch {
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
      export: data => ({ kind: 'plain-text', data: { text: data.code } }),
      canImport: payload => (payload?.kind === 'plain-text' || payload?.kind === 'rich-text') && typeof payload.data?.text === 'string',
      import(payload) {
        if ((payload?.kind !== 'plain-text' && payload?.kind !== 'rich-text') || typeof payload.data?.text !== 'string') throw new TypeError('Code can only import textual payloads')
        return { code: payload.data.text, language: 'auto' }
      },
    }),
    htmlImport: Object.freeze({
      matchesRoot(element) {
        return element.tagName === 'PRE' || element.tagName === 'CODE'
      },
      importRoot(element) {
        const code = element.tagName === 'PRE'
          ? (element.querySelector(':scope > code') ?? element)
          : element
        return { code: code.textContent ?? '', language: 'auto' }
      },
    }),
    paste: Object.freeze({
      accepts(input) {
        return input.kind === 'text' && /(^#!|^<\?(?:php|=)|^import\s|^SELECT\s|^#include\s)/im.test(input.text)
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
          const bar = document.createElement('div')
          bar.className = 'oe-code-bar'
          const language = document.createElement('select')
          language.className = 'oe-code-language'
          language.setAttribute('aria-label', runtimeContext.t('language', 'Language'))
          for (const value of LANGUAGES) {
            const option = document.createElement('option')
            option.value = value
            option.textContent = value === 'auto' ? 'Auto' : value
            language.appendChild(option)
          }
          const copy = document.createElement('button')
          copy.type = 'button'
          copy.className = 'oe-code-btn oe-code-btn--copy'
          copy.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
          copy.setAttribute('aria-label', runtimeContext.t('copy', 'Copy'))
          setTrustedHtml(copy, COPY_ICON)
          const edit = document.createElement('button')
          edit.type = 'button'
          edit.className = 'oe-code-btn oe-code-btn--edit'
          edit.textContent = runtimeContext.t('edit', 'Edit')
          bar.append(language, copy, edit)

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
          const refresh = () => { if (!dead) highlight(codeElement, data.code, data.language, runtime) }
          const mode = () => {
            wrapper.classList.toggle('oe-code-wrap--editing', editMode && !readOnly)
            textarea.hidden = !(editMode && !readOnly)
            pre.hidden = editMode && !readOnly
            edit.hidden = readOnly
            edit.disabled = readOnly
            language.disabled = readOnly
            textarea.readOnly = readOnly
          }
          const project = next => {
            data = { ...next }
            if (textarea.value !== next.code) textarea.value = next.code
            if (language.value !== next.language) language.value = next.language
            refresh()
            mode()
          }
          refreshers.add(refresh)
          project(data)

          language.addEventListener('change', () => {
            if (!readOnly && !dead) context.updateData(current => ({ ...current, language: language.value || 'auto' }))
          }, { signal: context.signal })
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
            if (dead || !data.code) return
            const clipboard = document.defaultView?.navigator?.clipboard
            if (typeof clipboard?.writeText !== 'function') return
            void clipboard.writeText(data.code).then(() => {
              if (dead || context.signal.aborted) return
              setTrustedHtml(copy, CHECK_ICON)
              copy.classList.add('oe-code-btn--copied')
              if (copyResetTimer !== null) timerHost.clearTimeout(copyResetTimer)
              copyResetTimer = timerHost.setTimeout(() => {
                copyResetTimer = null
                if (dead || context.signal.aborted) return
                setTrustedHtml(copy, COPY_ICON)
                copy.classList.remove('oe-code-btn--copied')
              }, 1800)
            }).catch(() => {})
          }, { signal: context.signal })
          textarea.addEventListener('keydown', event => {
            if (readOnly) return
            if (event.key === 'Enter') event.stopPropagation()
            if (event.key !== 'Tab') return
            event.preventDefault()
            event.stopPropagation()
            context.commitDomMutation(() => {
              if (event.shiftKey) dedentTextarea(textarea, 2)
              else textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end')
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
              refreshers.delete(refresh)
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
