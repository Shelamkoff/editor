// Deliberately failing child cases must be reported as failures by the real
// harness. This page succeeds only when their independently listed outcomes match.
import * as h from './regressions/harness.js'
function eventError(message) {
  const button = document.createElement('button')
  button.addEventListener('click', () => { throw new Error(message) })
  button.click()
}
h.test('unexpected DOM handler exception', () => eventError('unexpected event'))
h.test('unexpected rejected promise', async () => {
  void Promise.reject(new Error('unexpected rejection'))
  await h.pause(20)
})
h.test('synchronous assertion failure', () => { throw new Error('assertion witness') })
h.test('expected event is observed', () => {
  h.expectError?.(/deliberate event/)
  eventError('deliberate event')
})
h.test('missing expected event is a failure', () => { h.expectError?.(/never raised/) })
h.test('wrong event cannot satisfy an expectation', () => {
  h.expectError?.(/expected message/)
  eventError('wrong message')
})
h.test('one expectation does not swallow two events', () => {
  h.expectError?.(/same message/)
  eventError('same message'); eventError('same message')
})
h.test('later clean case is independent', () => {})
await h.run()
const outcomes = window.__auditResults
const want = ['FAIL', 'FAIL', 'FAIL', 'PASS', 'FAIL', 'FAIL', 'FAIL', 'PASS']
const correct = outcomes.length === want.length && outcomes.every((item, index) => item.status === want[index])
document.body.dataset.status = correct ? 'pass' : 'fail'
document.querySelector('#result').textContent = JSON.stringify({ correct, want, outcomes }, null, 2)
// The diagnostic runner must report the page result, not the expected child failures.
delete window.__auditResults
