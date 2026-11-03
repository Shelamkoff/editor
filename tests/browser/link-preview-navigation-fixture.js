export const navigationTemplates = ['horizontal', 'compact', 'large-top', 'minimal', 'twitter', 'notion', 'split']
export const navigationModes = ['editable', 'reader', 'into-reader', 'back-to-editable', 'renderer']
export const linkPreviewNavigationCases = [
  ...navigationTemplates.flatMap(template => navigationModes.map(mode => ({ id: `${template}/${mode}/click`, template, mode, gesture: 'click', trustedPolicy: false }))),
  ...['ctrl-click', 'middle-click'].flatMap(gesture => navigationModes.map(mode => ({ id: `minimal/${mode}/${gesture}`, template: 'minimal', mode, gesture, trustedPolicy: false }))),
  ...navigationModes.map(mode => ({ id: `minimal/${mode}/trusted-policy`, template: 'minimal', mode, gesture: 'click', trustedPolicy: true })),
]

export async function mountNavigationCase({ sourceBase, legacy, spec }) {
  const holder = document.createElement('section')
  holder.id = 'subject-holder'
  document.body.append(holder)
  const url = location.origin + '/destination?case=subject'
  const data = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'link', type: 'linkPreview', ...(!legacy ? { dataVersion: 1 } : {}),
    data: { url, title: 'Navigation title', description: 'Description', image: '', favicon: '', domain: 'display.example', template: spec.template } }] }
  const initialReader = spec.mode === 'reader' || spec.mode === 'back-to-editable'
  let owner
  if (spec.mode === 'renderer') {
    const { EditorRenderer } = await import(sourceBase + 'renderer/index.js')
    owner = new EditorRenderer({ blockTypes: ['linkPreview'] })
    owner.renderTo(data, holder)
  } else {
    const [{ createEditor }, plugin] = await Promise.all([import(sourceBase + 'core/index.js'), import(sourceBase + 'plugins/link-preview/index.js')])
    owner = createEditor({ holder, plugins: [legacy ? new plugin.LinkPreview() : plugin.createLinkPreviewPlugin()], inlineTools: [], readOnly: initialReader, data })
    if (spec.mode === 'into-reader') owner.setReadOnly(true)
    if (spec.mode === 'back-to-editable') owner.setReadOnly(false)
  }
  const card = holder.querySelector('a')
  card.id = 'subject'
  const activations = [], transactions = []
  for (const type of ['click', 'auxclick']) card.addEventListener(type, event => queueMicrotask(() => activations.push({
    type: event.type, trusted: event.isTrusted, button: event.button, ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, prevented: event.defaultPrevented,
  })))
  if (!legacy && spec.mode !== 'renderer') owner.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin, name: event.name }))
  window.navigationProbe = {
    inspect() { return { href: card.href.replace(location.origin, ''), target: card.getAttribute('target'), rel: (card.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean).sort(),
      title: card.querySelector('[class$="__title"]')?.textContent, canonical: spec.mode === 'renderer' ? data.blocks : owner.save().blocks,
      history: spec.mode === 'renderer' ? null : [owner.canUndo, owner.canRedo], activations: structuredClone(activations), transactions: structuredClone(transactions) } },
    destroy() { owner.destroy(); holder.remove() },
  }
  const control = document.createElement('a')
  control.id = 'control'; control.href = location.origin + '/destination?case=control'; control.target = '_blank'; control.rel = 'noopener noreferrer'; control.textContent = 'Native control'
  const controlActivations = []
  for (const type of ['click', 'auxclick']) control.addEventListener(type, event => queueMicrotask(() => controlActivations.push({ type: event.type, trusted: event.isTrusted, button: event.button, ctrlKey: event.ctrlKey, prevented: event.defaultPrevented })))
  document.body.append(control)
  window.controlActivations = controlActivations
}
