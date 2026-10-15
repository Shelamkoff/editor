// @ts-check

/** @type {WeakMap<object, Readonly<import('./documentTypes').DocumentValidationIssue>>} */
const issues = new WeakMap()

/** Associate a failure with the boundary that knows its meaning, preserving object identity.
 * @param {unknown} failure
 * @param {import('./documentTypes').DocumentValidationIssue} issue
 */
export function markDocumentValidationFailure(failure, issue) {
  const error = failure !== null && (typeof failure === 'object' || typeof failure === 'function')
    ? failure : new Error('Document validation failed', { cause: failure })
  issues.set(error, Object.freeze({ ...issue }))
  return error
}

/** @param {unknown} failure */
export function documentValidationIssue(failure) {
  return failure !== null && (typeof failure === 'object' || typeof failure === 'function')
    ? issues.get(failure) : undefined
}

/** Annotate native shape failures while retaining a more specific child boundary.
 * @template T
 * @param {import('./documentTypes').DocumentValidationIssue} issue
 * @param {() => T} operation
 * @returns {T}
 */
export function validationBoundary(issue, operation) {
  try { return operation() }
  catch (error) { throw documentValidationIssue(error) ? error : markDocumentValidationFailure(error, issue) }
}

/** Schema callbacks own their classification even when they throw a previously annotated object.
 * @template T
 * @param {Omit<import('./documentTypes').DocumentValidationIssue, 'reason'>} identity
 * @param {() => T} operation
 * @returns {T}
 */
export function schemaValidationBoundary(identity, operation) {
  try { return operation() }
  catch (error) { throw markDocumentValidationFailure(error, { reason: 'invalid-data', ...identity }) }
}
