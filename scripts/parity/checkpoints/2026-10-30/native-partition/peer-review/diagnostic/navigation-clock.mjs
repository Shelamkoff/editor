import { writeFile } from 'node:fs/promises'

// Passive measurement only: no bindings, input, DOM writes or injected scripts.
const [port, output] = process.argv.slice(2)
const deadline = Date.now() + 45_000
let socket
let id = 0
const pending = new Map()
try {
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).catch(() => [])
    const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
    if (!target) { await new Promise(r => setTimeout(r, 50)); continue }
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      const resolve = pending.get(message.id)
      if (resolve) { pending.delete(message.id); resolve(message) }
    })
    while (Date.now() < deadline) {
      const requestId = ++id
      const response = new Promise(resolve => pending.set(requestId, resolve))
      socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: {
        expression: '({url:location.href,timeOrigin:performance.timeOrigin,pageElapsedMs:performance.now(),status:document.body?.dataset.status??null,navigation:performance.getEntriesByType("navigation").map(n=>({name:n.name,startTime:n.startTime,domInteractive:n.domInteractive,loadEventEnd:n.loadEventEnd}))})',
        returnByValue: true,
      } }))
      const message = await Promise.race([response, new Promise(resolve => setTimeout(() => resolve(null), 2_000))])
      const value = message?.result?.result?.value
      if (value?.url.includes('/tests/browser/native-plugin-parity.html')) {
        await writeFile(output, JSON.stringify({ observer: 'read-only Runtime.evaluate; detached after first matching page clock', capturedAt: new Date().toISOString(), ...value }, null, 2) + '\n')
        socket.close()
        process.exit(0)
      }
      await new Promise(r => setTimeout(r, 50))
    }
    break
  }
  throw new Error('Could not sample native plugin page navigation clock')
} catch (error) {
  if (socket) socket.close()
  await writeFile(output, JSON.stringify({ error: String(error), capturedAt: new Date().toISOString() }, null, 2) + '\n')
  process.exit(1)
}
