const allowedRussianGuideLatin = new Set([
  'rector', 'vitepress', 'json', 'html', 'css', 'dom', 'esm', 'api', 'url',
  'mime', 'npm', 'node.js', 'github', 'youtube', 'vimeo', 'http', 'https',
  'command', 'control', 'macos', 'windows', 'linux', 'weakmap', 'abortsignal',
  'documentfragment', 'typeerror', 'htmlelement',
  'attaches', 'checklist', 'code', 'columns', 'delimiter', 'embed', 'gallery',
  'heading', 'image', 'linkpreview', 'list', 'paragraph', 'person', 'poll', 'carousel', 'carouselblock',
  'quote', 'raw', 'spoiler', 'table', 'toggle', 'warning', 'color', 'mention',
  'highlight.js', 'mit',
  // Ecosystem names and the guide's technical glossary, not arbitrary prose.
  'vite', 'nuxt', 'inline', 'subpath', 'runtime', 'browser', 'native',
  'id', 'svg', 'es', 'raw', 'gallery', 'person', 'v2', 'ui',
  'definitions', 'definition', 'capabilities', 'fallback', 'realm', 'model', 'first', 'plugin', 'owned', 'split', 'commit', 'allowlist', 'settings', 'actions', 'capability', 'panel', 'text', 'files', 'block', 'rich', 'result', 'keyboard', 'router', 'context', 'resolver', 'payload', 'listeners', 'observers', 'requests', 'object', 'urls', 'controls', 'editable', 'fields', 'async', 'signal', 'lifetime', 'renderer', 'read', 'only', 'type', 'schema', 'semantics', 'tool', 'persisted', 'toolbar', 'trigger', 'unicode', 'point', 'pagination', 'callbacks', 'paste', 'patterns', 'persistence', 'cleanup', 'popup', 'host', 'labels', 'trusted', 'markup', 'sinks', 'package', 'icons', 'reference', 'counted', 'light', 'dark', 'core', 'styles', 'render', 'conversion', 'history', 'replay', 'driven', 'update', 'editor', 'renderers', 'owner', 'source',
])


/** Return unrecognized Latin prose while ignoring code, links and markup. */
export function untranslatedGuideTerms(markdown) {
  const prose = markdown
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')
    .replace(/\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:#\d+|[A-Za-z]+);/g, '')
  const latinWords = [...new Set(
    [...prose.matchAll(/[A-Za-z][A-Za-z0-9+]*(?:\.[A-Za-z]+)?/g)]
      .map(match => match[0].toLowerCase())
      .filter(word => !allowedRussianGuideLatin.has(word)),
  )]
  return latinWords
}
