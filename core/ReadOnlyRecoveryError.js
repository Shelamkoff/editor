// @ts-check
// Internal projector signal: unlike a plugin's AggregateError, this means that
// committed controls could not be restored and mutation authority must stop.
export class ReadOnlyRecoveryError extends AggregateError {}
