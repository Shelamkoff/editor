import { Attaches } from '../../../plugins/attaches/index.js'
import { registerUploadFailureTests } from './upload-failure-helpers.js'

export function register() {
  registerUploadFailureTests({
    type: 'attaches', Base: Attaches, selector: '.oe-attaches__select',
    count: data => data.files.length, mime: 'application/pdf', name: 'report.pdf',
  })
}
