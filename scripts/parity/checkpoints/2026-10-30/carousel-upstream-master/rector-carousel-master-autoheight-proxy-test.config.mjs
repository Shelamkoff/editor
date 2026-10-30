import base from '/tmp/rector-carousel-master-autoheight-20261030/playwright.config.mjs'
const inherited = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY
if (!inherited) throw new Error('The managed environment proxy is unavailable')
const address = new URL(inherited)
const proxy = { server: address.origin, bypass: '127.0.0.1,localhost',
  ...(address.username ? { username: decodeURIComponent(address.username) } : {}),
  ...(address.password ? { password: decodeURIComponent(address.password) } : {}),
}
export default {
  ...base,
  testDir: '/tmp/rector-carousel-master-autoheight-20261030/tests/browser',
  outputDir: '/tmp/rector-carousel-master-autoheight-proxy-playwright-results',
  retries: 0,
  workers: 1,
  use: { ...base.use, launchOptions: { executablePath: process.env.EDITOR_CHROME_PATH, proxy, args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
  webServer: { ...base.webServer, cwd: '/tmp/rector-carousel-master-autoheight-20261030', reuseExistingServer: false },
}
