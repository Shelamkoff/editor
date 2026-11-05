# Mention native label editing 2026-11-05

**Accepted: INLINE_MENTION_LABEL.**
Register: **161 accepted / 48 open / 209 total**. Tested source: `46fc2e15e23a655866b40525a10b9c9000b6969d`.

`INLINE_MENTION_LABEL` is accepted on `46fc2e15`: **161/209 obligations accepted, 48 open**. All **seven affected gates** pass on one clean unchanged source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-05/mention-label/README.md): **52 current executions / 1200 observations**, **396 module identities** and **24 rejected corruptions**. Production is unchanged.

Twenty-six cases cover native character deletion in both directions, emoji deletion with a surviving combining mark, English/Russian word deletion, four line deletions, forward/backward range replacement and label-local system Cut/Paste including the trigger. Edits preserving the trigger retain the original widget and payload ID with the exact new name. Removing or replacing the trigger unwraps text and drops widget identity. Exact surrounding text/BRs, source callers, callbacks, search queries, directed initial range and immediate edit caret are required. Leaving the widget closes search and its editing class. Every change remains one correctly owned transaction with exact raw keyboard Undo/Redo.

Word cases first perform the same trusted key on an ordinary editable span outside the editor; its text and lack of editor history independently bind native browser word boundaries. Four line cases invoke Chromium native editing commands and record trusted `deleteSoftLineBackward`/`deleteSoftLineForward` events; no hardware-key mapping is inferred. Clipboard cases use actual trusted system Copy/Cut/Paste.

All 26 bodies finish for every reference, without page/input errors or unavailable bodies. V1 retains **146 differences**; baseline, immutable parent and both current policies retain zero. Four exploratory attempts remain with exact bytes/source/date. The initial full matrix incorrectly expected Ctrl+Delete to retain the following space in English/Russian; native controls established the correct complete-word deletion. The final exploratory matrix also binds immediate caret ownership. A CRLF warning from a Git read during the first line probe is retained verbatim and is not a failed browser observation.

Native pages pass **138 cases**, including the existing Mention popup and native edge regressions covering label projection and replay. Inventory is **138 native / 57 ordinary browser pages**. Documentation and site pass. Exact runtime/package identity and 115 Git-verified artifacts retain all fifteen full gates on `c0054fb8`, with actual source/date. Only Mention label editing is newly accepted; the complete Mention query surface and full readiness remain open.

Post-acceptance documentation and site checks pass on `3f9b82a6`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
