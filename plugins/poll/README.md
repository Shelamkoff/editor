# Poll block plugin

Single- or multiple-choice poll with local results or an application-provided live data source.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Poll } from '@shelamkoff/rector/plugins/poll'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Poll()],
})
```

The registered block type is `poll`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "pollId": "release-survey",
  "question": "Which channel should receive the release?",
  "type": "single",
  "options": [{ "id": "stable", "text": "Stable" }, { "id": "next", "text": "Next" }],
  "resultsMode": "afterVote",
  "initialResults": { "total": 0, "options": [{ "id": "stable", "votes": 0 }, { "id": "next", "votes": 0 }] }
}
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `pollId` | with `dataSource` | Non-empty application identity used by a remote `dataSource`. It is not generated automatically. Without it a configured source is not loaded and vote submission reports an error. |
| `question` | yes | Non-blank poll question. |
| `type` | yes | `single` or `multiple`. |
| `options` | yes | At least two options. Every option requires a unique non-empty `id` and non-blank `text`; ids remain stable when text or ordering changes. |
| `resultsMode` | yes | `always`, `afterVote`, or `hidden`; normalization defaults to `always`. |
| `initialResults` | no | Optional initial or local result snapshot. When present, both `total` and `options` are required. |
| `initialResults.total` | with `initialResults` | Non-negative integer ballot count used as the percentage denominator before a live source responds or during local voting. |
| `initialResults.options` | with `initialResults` | Exactly one `{ id, votes }` entry for every author option. Every vote count is a non-negative integer. In a multiple-choice poll their sum may exceed `total`. |
| `revision` | runtime | Optional opaque server revision. `compareRevisions` defines its ordering when arrival order is insufficient. |
| `voters`, `votersTotal`, `currentUserVote` | runtime | Optional server result details. Voter ids are required; names, media-policy avatars, and selected option ids are normalized. Live runtime fields are not written into undo/redo history. |

`type` is `single` or `multiple`; `resultsMode` is `always`, `afterVote`, or `hidden`. Option ids are stable document identities. Without `dataSource`, votes update `initialResults` and enter undo/redo. With `dataSource`, live results, voter details, revisions, and the current user vote remain runtime state and are never serialized into editor history.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`dataSource?: PollDataSource` supplies required `load` and `vote` callbacks and an optional `subscribe` callback for server-owned results. Every callback receives an `AbortSignal`; `vote` also receives the current `revision`. Every result must contain `total` and one `{ id, votes }` entry for every current option. `total` is the number of ballots and is the percentage denominator; multiple-choice percentages may add up to more than 100%. `compareRevisions?: (next, current) => number` orders opaque revision strings when the backend can deliver updates out of order; without it, unequal revisions follow arrival order. `onError?: (error) => void` observes data-source failures. `maxVoters?: number` limits retained voter details; finite values are rounded down and clamped to zero, while an omitted or non-finite value uses `50`.

```js
const poll = new Poll({
  dataSource: {
    async load({ pollId, signal }) {
      return api.getPollResults(pollId, { signal })
    },
    async vote({ pollId, optionIds, revision, signal }) {
      return api.submitPollVote(pollId, { optionIds, revision }, { signal })
    },
    subscribe({ pollId, signal, onUpdate, onError }) {
      const connection = api.subscribeToPoll(pollId, { onUpdate, onError })
      signal.addEventListener('abort', () => connection.close(), { once: true })
      return () => connection.close()
    },
  },
  compareRevisions: (next, current) => Number(next) - Number(current),
  onError(error) {
    console.error('Poll data source failed', error)
  },
})
```

`load` obtains the initial authoritative snapshot. `vote` submits the complete current selection, not a delta, and returns the new authoritative snapshot. `subscribe` sends later snapshots through `onUpdate`; call `onError` for connection errors and return an idempotent cleanup function. The plugin also aborts the supplied signal when the block or editor is disposed. Do not assume revisions are numeric unless the application supplies a numeric `compareRevisions` as in the example.

## Capabilities

Question and option editing; result visibility; option ordering; local voting; cancellable load/vote; live subscriptions; revision ordering; voter summaries; duplicate-submission protection and deterministic cleanup.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/poll`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
