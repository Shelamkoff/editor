import { createEditor } from '../../index.js'
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { createEditorRenderer } from '../../renderer/index.js'
import { runPublicExtensionConformance } from './public-extension-conformance.js'

const results = await runPublicExtensionConformance({ createEditor, setSanitizedHtml, createEditorRenderer })
document.querySelector('#result').textContent = JSON.stringify(results, null, 2)
document.body.dataset.status = results.every(result => result.status === 'PASS') ? 'pass' : 'fail'
