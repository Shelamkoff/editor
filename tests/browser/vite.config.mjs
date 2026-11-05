// Independent browser processes must not invalidate one another's optimized
// dependencies while a page is running. The runner owns and removes this cache.
export default { cacheDir: process.env.EDITOR_VITE_CACHE_DIR }
