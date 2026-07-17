import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const pluginsRoot = resolve(root, 'plugins')
const errors = []

async function collectJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const sources = []
  for (const entry of entries) {
    if (entry.name === 'locale') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) sources.push(...await collectJavaScript(path))
    else if (entry.isFile() && entry.name.endsWith('.js')) sources.push(await readFile(path, 'utf8'))
  }
  return sources.join('\n')
}

const entries = await readdir(pluginsRoot, { withFileTypes: true })
for (const entry of entries) {
  if (!entry.isDirectory()) continue
  const directory = join(pluginsRoot, entry.name)
  if (!existsSync(join(directory, 'index.js'))) continue

  const englishPath = join(directory, 'locale', 'en.js')
  const russianPath = join(directory, 'locale', 'ru.js')
  if (!existsSync(englishPath) || !existsSync(russianPath)) {
    errors.push(`${entry.name}: both locale/en.js and locale/ru.js are required`)
    continue
  }

  const english = (await import(`${pathToFileURL(englishPath).href}?audit=${Date.now()}`)).default
  const russian = (await import(`${pathToFileURL(russianPath).href}?audit=${Date.now()}`)).default
  const englishKeys = Object.keys(english)
  const russianKeys = Object.keys(russian)
  const namespace = englishKeys[0]?.split('.').slice(0, 2).join('.')
  const prefix = namespace ? `${namespace}.` : ''
  if (!prefix.startsWith('plugin.')) {
    errors.push(`${entry.name}: English locale does not declare a plugin namespace`)
    continue
  }

  for (const key of englishKeys) {
    if (!(key in russian)) errors.push(`${entry.name}: Russian locale is missing ${key}`)
    if (!key.startsWith(prefix)) errors.push(`${entry.name}: ${key} is outside ${prefix}*`)
  }
  for (const key of russianKeys) {
    if (!(key in english)) errors.push(`${entry.name}: English locale is missing ${key}`)
    if (!key.startsWith(prefix)) errors.push(`${entry.name}: ${key} is outside ${prefix}*`)
  }

  const source = await collectJavaScript(directory)
  const shortKeys = new Set(
    [...source.matchAll(/(?:this\.)?_(?:t|p)\(\s*['"]([^'"]+)['"]/g)]
      .map(match => match[1]),
  )
  for (const shortKey of shortKeys) {
    const fullKey = `${prefix}${shortKey}`
    if (!(fullKey in english)) errors.push(`${entry.name}: source uses ${shortKey}, but ${fullKey} is not translated`)
  }
}

if (errors.length) {
  console.error(`Plugin locale audit found ${errors.length} issue(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('Plugin locale audit passed')
}
