import { createHash } from 'node:crypto'
export default {
  cacheDir: '/tmp/rector-root-vite-' + createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12),
  server: { fs: { allow: ['/tmp', '/workspace', '/opt/codex'] } },
}
