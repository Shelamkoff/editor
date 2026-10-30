# Independent Code source and language review

## Decision

The independent review supports acceptance of **`BLOCK_CODE_SOURCE` and `BLOCK_CODE_LANGUAGE` in the recorded Chrome scope**, subject to the parent's integration gates. No blocking product or fixture defect was found. This is a review of candidate `e6842abf21aee9655d56900ec9fb784edd864609`, tree `3f63560957dbb38b9f5eba5cc3228bda3cd988a4`; it is not a new browser execution or a claim about the later integrated runtime.

The reviewer inspected the browser fixture, native bridge, exact-source runner, Code instance lifecycle, language-menu implementation and shared indentation helpers. The implementation was read to assess the exercised public paths and negative controls; it does not calculate the offline audit's expected results. No production, fixture or parent archive file was changed for this review.

## Independent evidence checks

`review.py` imports no browser fixture or production helper. Its own literal corpus contains twelve source-edit examples and eight language-control examples. Fixed full source strings, selected ranges and direction, language values and visible menu inventories are written independently. The offline transition model reconstructs each intended document, history state and transaction-event count, including the separate subsequent or preceding `X` edit. Current full block snapshots also retain the two neighboring Paragraph records and their declared data versions.

The audit passes **19,248 checks**. This number includes repeated integrity and cardinality assertions and is not a browser-test or independent-defect count. The relevant components are:

| Evidence | Verified result |
|---|---:|
| Original raw actual-versus-expected verdicts, all three sources | 6,018 |
| Candidate observations compared with independently fixed expectations | 1,764 |
| Full candidate phase snapshots | 160; document and history both checked |
| Native harness case inventory | Exactly 20 named PASS cases |
| Production modules served from recorded Git sources | 300 byte hashes |
| Loaded dependency bytes / package versions | 6 / 8 |

The exact candidate tree is rebuilt from the archived full-index patch over the published base. The original raw commit bytes are hash-checked and reconstructed in a temporary Git object store with a temporary index. Repository refs, index and object store are not modified. The candidate contains no production changes relative to its base. Source/fixture/runner identities, archive payload hashes, process outcomes and complete ordered phase inventories are checked separately.

| Source | Complete cases | Observations | Preserved FAIL observations |
|---|---:|---:|---:|
| v1 `5e5c7f8d…` | 20 | 1,894 | 178 |
| Specification baseline `e981ff30…` | 20 | 2,062 | 232 |
| Candidate `e6842abf…` | 20 | 2,062 | 0 |

All three sources have empty recorded page-error channels and no incomplete cases. The comparison's actual process exit is **1**, retaining the historical failures. The distinct candidate result is successful. Historical failed observations include selection/history replay, line-boundary indentation, language controls and incorrect highlighting of plain or unknown source. These observations can share a cause and are not counts of independently diagnosed bugs. Current improvements are preserved.

## Why the controls are meaningful

The source examples distinguish caret insertion from single-line replacement, partial multiline selections from ranges ending exactly at the next line start, both range directions, empty lines, a final newline, mixed tabs/spaces, a caret inside indentation and an unindented no-op. Expected indentation width is four spaces. Exact canonical text, literal paint and absence of parsed `p`/`b` elements expose accidental HTML interpretation. The independent input and indentation histories must undo and redo separately with the corresponding selections.

Language choices exercise actual visible controls with trusted pointer or key events. Filtering must leave the canonical source and transaction count unchanged. Auto, supported explicit languages, Plain text and a nonempty unknown language have different fixed provider expectations. The language action and preceding source edit have independent Undo/Redo states. Same-language selection, Escape and an empty result do not create another authoring action. Explicitly refocusing the source before history preserves the current auxiliary-focus design rather than forcing historical post-menu focus behavior.

Read-only and destroy negatives invoke the retained `php` option, which differs from every final language in the corpus. Before destroy, the source is returned to editable mode. Reading the real menu implementation confirms that its programmatic option action does not require an open menu; therefore an already closed panel alone cannot explain the negative result. The detached markup, provider count and observed author transactions remain unchanged. The read-only snapshot comparison intentionally freezes the preceding **actual** state: an old failed language choice is not silently repaired before checking that read-only prevents a further change.

The runner requires nonempty current cases and observations, exact nonempty phase plans, absence of errors and unsupported current cases, and unchanged committed fixture/runner/source. Historical failures remain in their original failure arrays. The offline audit re-evaluates every stored verdict and independently checks the intended semantic expectations; it does not trust the stored PASS strings.

## Limits and retained preparation outcomes

This proof covers the recorded Chrome `156.0.8078.79` / Node `v24.22.1` environment. The reviewer did not repeat browser runs because no remaining defect required one. The native process metadata records its starting HEAD and actual exit 0; the complete before/after source-equality record belongs to the separate immutable differential. The partial wrapper record must not be promoted to a complete native before/after verification record.

Console messages and the diagnostic callback were not collected by this fixture. Page errors and server errors were collected. The supplied highlighting runtime is a controlled compatible provider; this proof does not claim a real network-loaded provider lifecycle. Exact source selection is covered for indentation and explicitly refocused language history, not general focus after closing a language menu. Other Code rows, other browsers, unsettled `B-HTML`/`B-STYLE` choices and whole-library parity remain outside this acceptance.

The parent archive retains the initial read-only `canUndo` expectation error as test preparation, not a product RED. It also retains complete earlier green output with unavailable terminal outcomes and an intervening wrapper with an unrecorded second process outcome. Only the later explicitly recorded native and differential outcomes supply the process-status claims above.

## Reproduction

After integrating this directory alongside its parent checkpoint and installing the recorded dependencies:

```sh
python scripts/parity/checkpoints/2026-10-30/code-source-language/peer-review/review.py \
  --repo . \
  --output /tmp/code-source-language-peer-review.json
```

Use `--checkpoint` to read an archive in another checkout and `--dependencies` when its installed dependencies are elsewhere. The audit restores the exact original candidate into temporary storage, so a fresh clone need not retain the original unpublished working-branch commit as a branch ancestor.
