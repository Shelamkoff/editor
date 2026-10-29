const check = (value, message) => { if (!value) throw new Error(message) }
const settle = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

export async function measure(variants, { sizes = [50, 200, 800], warmup = 3, samples = 9 } = {}) {
  const modules = await Promise.all(variants.map(async variant => ({ ...variant,
    ...(await import('/' + variant.label + '/core/index.js')),
    ...(await import('/' + variant.label + '/plugins/paragraph/index.js')),
  })))
  const results = []
  for (const size of sizes) {
    const subjects = modules.map(variant => {
      const holder = document.createElement('section')
      document.body.append(holder)
      let commits = 0, updates = 0, modes = 0, decodes = 0, creates = 0
      const contexts = new Map()
      const inlineSchema = {
        currentVersion: 1, createDefault: () => ({ label: '' }),
        decode({ dataVersion, data }) {
          decodes++
          check(dataVersion === 1 && typeof data?.label === 'string', 'Invalid inline data')
          return { dataVersion: 1, data: { label: data.label } }
        },
        encode(data) {
          check(typeof data?.label === 'string', 'Invalid encoded inline data')
          return { dataVersion: 1, data: { label: data.label } }
        },
      }
      const definition = { type: 'benchmark-badge', label: { key: 'badge', fallback: 'Badge' }, icon: '', schema: inlineSchema,
        setup({ ownerDocument }) { return {
          create(id, data, context) {
            creates++
            contexts.set(id, context)
            const element = ownerDocument.createElement('span')
            element.textContent = data.label
            return { element, update(next) { updates++; element.textContent = next.label },
              setReadOnly() { modes++; element.contentEditable = 'false' }, destroy() {}, }
          }, destroy() {},
        } },
      }
      const ids = Array.from({ length: size }, (_, index) => 'widget-' + index)
      const target = ids[Math.floor(size / 2)]
      const inline = Object.fromEntries(ids.map(id => [id,
        { type: definition.type, dataVersion: 1, data: { label: id } },
      ]))
      const data = { version: '2.0.0', blocks: [{ id: 'a', type: 'paragraph', dataVersion: 2,
        data: { text: 'Before ' + ids.map(id => '{{' + id + '}}').join(' / ') + ' after' }, inline }] }
      const editor = variant.createEditor({ holder, injectStyles: false, historyMaxStack: 1,
        plugins: [variant.createParagraphPlugin({ injectStyles: false })],
        inlinePlugins: [definition], inlineTools: [], data })
      editor.on('transaction:committed', () => { commits++ })
      const field = holder.querySelector('.oe-paragraph')
      check(field.querySelectorAll('[data-inline-plugin]').length === size, 'All actual widgets must be mounted')
      const tail = field.lastChild, initialCreates = creates
      let sequence = 0
      return { variant: variant.label, holder, editor, samples: [],
        inputUtf8Bytes: new TextEncoder().encode(JSON.stringify(data)).length,
        update() {
          const label = 'updated-' + (++sequence)
          const started = performance.now()
          contexts.get(target).updateData(() => ({ label }))
          const duration = performance.now() - started
          check(field.querySelector('[data-id="' + target + '"]').textContent === label, 'The chosen real widget must update')
          check(field.querySelectorAll('[data-inline-plugin]').length === size, 'No sibling may disappear')
          check(editor.save().blocks[0].inline[target].data.label === label, 'Save must include the accepted sidecar')
          return duration
        },
        verify() {
          check(commits === warmup + samples, 'Every public update must commit exactly once')
          check(updates === warmup + samples, 'Only one payload per update changes')
          check(creates === initialCreates, 'An update-capable widget must retain its occurrence')
          return { commits, updates, modes, decodes, creates, unchangedTail: field.lastChild === tail }
        },
      }
    })
    try {
      for (let index = 0; index < warmup; index++) {
        for (const subject of index % 2 ? [...subjects].reverse() : subjects) {
          subject.update()
          await settle()
        }
      }
      for (let index = 0; index < samples; index++) {
        for (const subject of index % 2 ? [...subjects].reverse() : subjects) {
          subject.samples.push(subject.update())
          await settle()
        }
      }
      for (const subject of subjects) {
        const ordered = [...subject.samples].sort((a, b) => a - b)
        results.push({ variant: subject.variant, widgets: size, inputUtf8Bytes: subject.inputUtf8Bytes,
          samplesMs: subject.samples, medianMs: ordered[Math.floor(ordered.length / 2)],
          minMs: ordered[0], maxMs: ordered.at(-1), ...subject.verify() })
      }
    } finally {
      for (const subject of subjects) { subject.editor.destroy(); subject.holder.remove() }
    }
  }
  return { warmup, samples, sizes, results }
}
