/** Put failing cases first; a long list of PASS cases must not hide the cause. */
export function formatBrowserFailure(summary) {
  const text = typeof summary === 'string' ? summary : 'summary unavailable'
  try {
    const results = JSON.parse(text)
    if (Array.isArray(results)) {
      const failures = results.filter(result => result && typeof result === 'object' && result.status !== 'PASS')
      if (failures.length) {
        return JSON.stringify({
          total: results.length,
          failed: failures.length,
          failures: failures.slice(0, 20).map(result => ({
            name: String(result.name ?? 'unnamed').slice(0, 500),
            status: result.status,
            error: String(result.error ?? 'No error details').slice(0, 2000),
          })),
        }, null, 2)
      }
    }
  } catch { /* Non-JSON pages retain their textual diagnostic. */ }
  return text.length > 8000 ? text.slice(0, 8000) + '\n[see full browser artifact]' : text
}
