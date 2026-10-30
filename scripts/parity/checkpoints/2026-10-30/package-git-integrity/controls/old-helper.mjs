function gitCommit(spec, name) {
  const match = typeof spec === 'string' && /^git\+[^#]+#([a-f0-9]{40})$/.exec(spec)
  if (!match) throw new Error(`${name} must use a full immutable Git commit`)
  return match[1]
}

/** Read immutable Git edges from the actual published manifest and its lock. */
export function getPinnedGitDependencies(manifest, lock) {
  return Object.entries(manifest.dependencies ?? {})
    .filter(([, spec]) => spec.startsWith('git+'))
    .map(([name, spec]) => {
      const commit = gitCommit(spec, name)
      const installed = lock.packages?.[`node_modules/${name}`]
      if (lock.packages?.['']?.dependencies?.[name] !== spec) {
        throw new Error(`${name} published Git dependency differs from the project lock`)
      }
      if (gitCommit(installed?.resolved, name) !== commit || typeof installed?.version !== 'string') {
        throw new Error(`${name} resolved Git dependency differs from the published pin`)
      }
      return { name, spec, commit, resolved: installed.resolved, version: installed.version }
    })
}

/** The consumer must resolve the original transitive Git edge, not a file substitute. */
export function assertConsumerGitDependencies(manifest, lock, dependencies) {
  const consumer = lock.packages?.[`node_modules/${manifest.name}`]
  for (const { name, spec, resolved, version } of dependencies) {
    if (manifest.dependencies?.[name] !== spec || consumer?.dependencies?.[name] !== spec) {
      throw new Error(`${name} published Git edge changed in the installed consumer`)
    }
    if (Object.hasOwn(lock.packages?.['']?.dependencies ?? {}, name)) {
      throw new Error(`${name} must be installed through the published Git edge, not a direct override`)
    }
    const installed = lock.packages?.[`node_modules/${name}`]
    if (installed?.resolved !== resolved || installed?.version !== version || installed?.link) {
      throw new Error(`${name} consumer resolution differs from the locked Git artifact`)
    }
  }
}
