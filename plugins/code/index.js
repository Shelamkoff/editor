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

function selectedPayloadText(payload,ownerDocument){
  if((payload?.kind!=='plain-text'&&payload?.kind!=='rich-text')||typeof payload.data?.text!=='string')throw new TypeError('Code can only join textual payloads')
  if(payload.kind==='plain-text')return payload.data.text
  const template=ownerDocument.createElement('template')
  setSanitizedHtml(template,payload.data.text)
  for(const lineBreak of template.content.querySelectorAll('br'))lineBreak.replaceWith(ownerDocument.createTextNode('\n'))
  return template.content.textContent??''
}

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
      selectionMode:'single',
      joinSelection(payloads,context){
        return {kind:'plain-text',data:{text:payloads.map(payload=>selectedPayloadText(payload,context.ownerDocument)).join('\n')}}
      },
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
          const refresh = () => { if (!dead) highlight(codeElement, textarea.value, data.language, runtime) }
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
          refreshers.add(refresh)
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
