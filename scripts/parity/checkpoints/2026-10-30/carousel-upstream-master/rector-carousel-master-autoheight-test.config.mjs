import base from '/tmp/rector-carousel-master-autoheight-20261030/playwright.config.mjs'
export default {
  ...base,
  testDir: '/tmp/rector-carousel-master-autoheight-20261030/tests/browser',
  outputDir: '/tmp/rector-carousel-master-autoheight-playwright-results',
  retries: 0,
  workers: 1,
  use: { ...base.use, launchOptions: { executablePath: process.env.EDITOR_CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
  webServer: { ...base.webServer, cwd: '/tmp/rector-carousel-master-autoheight-20261030', reuseExistingServer: false },
}
