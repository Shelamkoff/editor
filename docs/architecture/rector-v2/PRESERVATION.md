# Functional preservation register

This is the 209-scenario publication register derived from the recovery/read-boundary review. It is verification guidance; [the repository specification](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md) owns semantics. All 199 preceding scenario IDs and the ten recovery/read-boundary IDs are retained. Repeated boilerplate has been factored into the rules below; this is not a new runtime or compatibility format.

**Candidate status, 2026-10-29: 27 scenarios accepted within their recorded scopes; 182 remain open.** These comprise `RENDERER_CONSTRUCTION`, `BLOCK_QUOTE_PASTE_MERGE`, `RENDERER_OUTPUTS`, all nine `PRESENTATION_VALUES_FONT` rows, the two benign `PRESENTATION_VALUES_CLASS` rows, and the `ROUNDTRIP` rows for Paragraph, Heading, List, Quote, Warning, Code, Checklist, Delimiter, Toggle, Spoiler, Columns, Attaches and Raw. The [Paragraph/Heading review](/architecture/rector-v2/PUBLICATION_REVIEW#paragraph-and-heading-roundtrip-parity-2026-10-29) and [List/Quote/Warning review](/architecture/rector-v2/PUBLICATION_REVIEW#list-quote-and-warning-roundtrip-parity-2026-10-29) prove the complete shared template for those rich-field blocks. The [Code review](/architecture/rector-v2/PUBLICATION_REVIEW#code-roundtrip-parity-2026-10-29) proves the corresponding plain-text template. The [Checklist/Delimiter review](/architecture/rector-v2/PUBLICATION_REVIEW#checklist-and-delimiter-roundtrip-parity-2026-10-29) covers stable checklist items and a genuinely non-editable block. The [Toggle review](/architecture/rector-v2/PUBLICATION_REVIEW#toggle-roundtrip-parity-2026-10-29) covers open and closed populated content. The [Spoiler/Columns review](/architecture/rector-v2/PUBLICATION_REVIEW#spoiler-and-columns-roundtrip-parity-2026-10-29) covers independent rich fields, transient disclosure and fixed column layouts. The [Image literal-caption proof](/architecture/rector-v2/PUBLICATION_REVIEW#image-literal-caption-proof-2026-10-29) is partial and does not accept the Image row. The [presentation-values review](/architecture/rector-v2/PUBLICATION_REVIEW#presentation-values-parity-2026-10-29) proves the complete FONT templates and scoped class behavior. The [construction review](/architecture/rector-v2/PUBLICATION_REVIEW#construction-parity-2026-10-29), [expanded Quote review](/architecture/rector-v2/PUBLICATION_REVIEW#quote-paste-merge-parity-2026-10-29) and [renderer-output review](/architecture/rector-v2/PUBLICATION_REVIEW#renderer-output-parity-2026-10-29) identify the candidates, executed v1/baseline controls, environments and limitations. The original publication marked every candidate scenario not-implemented/not-run; that is the historical starting status, not a claim that every currently open scenario is a known defect. Baseline `e981ff308000c1d92d7e820df95113c1e19bcee8`; v1 reference `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` (1.0.5). Full fresh v1 execution is still pending. Existing evidence accepts only the explicitly recorded properties; a completed smoke does not accept the detailed behavior of another row.

## Common procedure and oracle

Use valid populated current and semantically equivalent v1 fixtures, with isolated roots and controlled providers/browser policies. Test-only adapters may translate API/wire spelling, not meaning, and never ship in production. Compare visible interaction, canonical text/marks/sidecars, meaningful identity/order, anchor/focus/direction, semantic history count and replay, provider/network effects, and resource/mode lifetime. Run negative safety/retirement controls alongside positive capability tests.

Allowed differences are repaired defect, relocated API with an equivalent capability, or representation with preserved semantics. No feature may disappear for refactoring/security/simplicity. Unknown/unexecuted results are not passes. Meaningful capabilities discovered later extend this minimum register.

**ROUNDTRIP template:** create both default and populated block, render detached/mounted output, switch read-only and back, update one declared editable field where present, Undo/Redo and destroy. Preserve content, marks/sidecars, meaningful IDs/order, renderer output and ownership. Delimiter has no fabricated editable field.

**TOOL template:** valid forward/backward noncollapsed Text- and Element-boundary selections, mixed marks and applicable cross-field/atomic-widget cases; apply the named operation and Undo/Redo. Expect intended text/formatting, exactly one completed semantic action or a canonical no-op, correct selection, and no producer/effect from retired UI. A toolbar creation test alone does not accept the action.

**FONT template:** load the stated size under controlled 20px host/16px root, save/render, edit neighboring content and Undo. Preserve accepted CSS meaning; the UI input range must not narrow imported typography. **TARGET template:** use a permitted controlled destination, inspect and activate with trusted input under an allowing host/browser policy. Preserve actual permitted navigation; attribute survival alone is insufficient. Platform restrictions are recorded separately from additional Rector suppression.

Source owners are the existing block `plugins/<path>/` and `renderer/renderers/<path>/` counterparts, tool/inline registries and the contract paths in the specification. `linkPreview` uses the `link-preview` directory. Do not infer behavior only from filenames: use the current declared capabilities and baseline traces.

## Scenarios

| ID | Action / precondition | Required observable result |
|---|---|---|
| BLOCK_PARAGRAPH_ROUNDTRIP | ROUNDTRIP paragraph. | **Accepted on `384fd985`, Chromium 142:** default/populated rich fields, marks/widgets, renderer output and native history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#paragraph-and-heading-roundtrip-parity-2026-10-29). |
| BLOCK_PARAGRAPH_TEXT | Type, select, format, insert each supported inline plugin, save/re-render and Undo/Redo. | Text, marks, sidecars and caret survive; no duplicated widget or extra history. |
| BLOCK_PARAGRAPH_SPLIT_MERGE | Enter at start/middle/end; supported Backspace/Delete boundaries. | Intended split/merge, prefix/suffix and inline data retained; default block behavior preserved. |
| BLOCK_PARAGRAPH_ALIGN_CONVERT | Each alignment and available conversion target. | Alignment/content retained; unsupported conversion rejects atomically without silent loss. |
| BLOCK_HEADING_ROUNDTRIP | ROUNDTRIP heading. | **Accepted on `384fd985`, Chromium 142:** actual H2 default and populated H3, rich widgets, renderer tags and native history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#paragraph-and-heading-roundtrip-parity-2026-10-29). |
| BLOCK_HEADING_LEVELS | Levels 2 through 6 through controls/toolbox. | Correct level/tag, unchanged text and one action. |
| BLOCK_HEADING_RICH_PASTE | Styled text/widgets and supported heading-root paste. | Content/level and neighboring author text preserved under declared routing. |
| BLOCK_HEADING_SPLIT_CONVERT | Native Enter/exit and conversion at supported boundaries. | Default/heading behavior, caret and identities preserved. |
| BLOCK_LIST_ROUNDTRIP | ROUNDTRIP list. | **Accepted on `71a0d4d5`, Chromium 142:** default/populated identified items, order/style, independent sibling contents and native history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#list-quote-and-warning-roundtrip-parity-2026-10-29). |
| BLOCK_LIST_STYLES | Toggle populated ordered/unordered list; render. | Intended style only; item text/order/identity preserved. |
| BLOCK_LIST_ITEM_EDIT | Enter within item, merge at supported boundary, exit empty final item. | Baseline editing retained; no invented nesting/indentation. |
| BLOCK_LIST_PARTIAL_CONVERT | Convert selected items with partial endpoints. | Selected content converts; unselected residuals/widgets survive as one action. |
| BLOCK_QUOTE_ROUNDTRIP | ROUNDTRIP quote. | **Accepted on `efae6d0e`, Chromium 142:** independent primary/caption fields, widgets, renderer slots and primary-field native history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#list-quote-and-warning-roundtrip-parity-2026-10-29). |
| BLOCK_QUOTE_FIELDS | Edit quotation/caption with marks/widgets and select between them. | Both fields independent; empty caption does not erase quote. |
| BLOCK_QUOTE_PASTE_MERGE | Paste blockquote, merge compatible neighbors, export/convert. | **Accepted on candidate `948bc554` / fixture `22ef5840`, Chromium 142:** routing, marks, all captions and unrelated blocks retained; trusted system paste, native merges, export/conversion and exact Undo/Redo. See [classified three-source evidence](/architecture/rector-v2/PUBLICATION_REVIEW#quote-paste-merge-parity-2026-10-29). |
| BLOCK_CODE_ROUNDTRIP | ROUNDTRIP code. | **Accepted on `9c038c80`, Chromium 142:** literal multiline source/language, textarea identity and selection, rendered output and native history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#code-roundtrip-parity-2026-10-29). |
| BLOCK_CODE_SOURCE | Literal HTML-like multiline source; Tab/Shift+Tab; replay. | Literal source, newlines/entities and selection retained; indentation one edit. |
| BLOCK_CODE_LANGUAGE | Keyboard/filter language choice; unknown nonempty language. | Selection works; unknown value remains readable with escaped plain fallback. |
| BLOCK_CODE_PASTE | Native pre/code roots and fenced text. | Source/language routing, not author HTML interpretation. |
| BLOCK_CODE_HIGHLIGHT_COPY | Default/injected/lazy highlighter; delayed/failed load; allowed/rejected copy. | Text readable, obsolete highlight cannot overwrite new data; copy failure does not author. |
| BLOCK_CODE_CONVERSION | Multiline cross-block conversion, partial endpoints and unsupported widgets. | Lines/entities/literals retained; unsupported widget conversion rejects atomically. |
| BLOCK_IMAGE_ROUNDTRIP | ROUNDTRIP image. | **Open:** the literal-caption subset passes; supported caption widgets expose derived-alt and backward-selection defects. [Partial evidence](/architecture/rector-v2/PUBLICATION_REVIEW#image-literal-caption-proof-2026-10-29). |
| BLOCK_IMAGE_SOURCES | File/URL/action in empty/populated image; cancel/reject upload. | Existing uploader/data-URL/caption behavior and one completed replacement retained. |
| BLOCK_IMAGE_CAPTION | Rich caption/widgets then sibling reprojection. | Current caption and selection retained on unrelated changes. |
| BLOCK_IMAGE_APPEARANCE | Width/height/min/max, fit/position, border/background/radius. | Stored values and visible behavior survive save/render/history. |
| BLOCK_IMAGE_EXPANDED | Custom sizing, expanded on then off. | Expanded ignores/disables applicable controls without erasing stored values; values return. |
| BLOCK_DELIMITER_ROUNDTRIP | ROUNDTRIP delimiter. | **Accepted on `7bfa26df`, Chromium 142:** real empty payload/HR, no editable descriptor or mode history, neighboring native edit with one Undo/Redo. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#checklist-and-delimiter-roundtrip-parity-2026-10-29). |
| BLOCK_DELIMITER_STRUCTURE | Insert/select/move/delete delimiter. | Correct order/shell/output; view selection creates no author history. |
| BLOCK_TABLE_ROUNDTRIP | ROUNDTRIP table. | Common roundtrip oracle. |
| BLOCK_TABLE_CELLS | Mixed marks/widgets in cells; update another cell. | Shape, row-local cell IDs and unaffected field/caret stable. |
| BLOCK_TABLE_ROWS_COLUMNS | Add/remove rows/columns via existing controls. | Supported structure/order/identities and surviving data; one completed action. |
| BLOCK_TABLE_HEADINGS | Toggle withHeadings, render/replay. | Heading changes without cell loss or identity churn. |
| BLOCK_TABLE_KEYBOARD | Native Enter/Tab/Shift+Tab. | Enter line break as one edit; row-major navigation; no guessed stale-field write. |
| BLOCK_TABLE_PASTE_CONVERT | Table-first HTML into selected paragraph; supported selection conversion. | Structural-first paste retains source text where required; residual fields survive conversion. |
| BLOCK_CHECKLIST_ROUNDTRIP | ROUNDTRIP checklist. | **Accepted on `f5ae4130`, Chromium 142:** default and populated labels, states, stable current item IDs, renderer/modes and native one-step history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#checklist-and-delimiter-roundtrip-parity-2026-10-29). |
| BLOCK_CHECKLIST_ITEMS | Add/edit/check/remove items. | Stable IDs/text/check state and undoable semantic actions. |
| BLOCK_CHECKLIST_EMPTY_EXIT | Empty, BR-only or formatting-only last/sole item Enter. | Supported exit/default conversion; visible text prevents accidental removal. |
| BLOCK_CHECKLIST_INLINE_MERGE | Labels with marks/widgets, merge/export. | Rich fields, sidecars and checks retained under actual capabilities. |
| BLOCK_WARNING_ROUNDTRIP | ROUNDTRIP warning. | **Accepted on `e38dd79f`, Chromium 142:** independent title/message fields, widgets, renderer slots and title-native history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#list-quote-and-warning-roundtrip-parity-2026-10-29). |
| BLOCK_WARNING_FIELDS | Edit/traverse title/message with formatting/widgets. | Both fields retained; nonempty field prevents residual deletion. |
| BLOCK_WARNING_RESIDUAL | Compound cut/merge/conversion with visually empty remnants. | Only empty residual removed; untouched fields/widgets survive. |
| BLOCK_EMBED_ROUNDTRIP | ROUNDTRIP embed. | Common roundtrip oracle. |
| BLOCK_EMBED_SERVICES | Valid/rejected YouTube/Vimeo URLs and IDs. | Existing service registry/ID validation, no arbitrary iframe provider. |
| BLOCK_EMBED_METADATA | Caption/cover/actions and delayed metadata/cancellation. | Only authorized current result updates the right instance. |
| BLOCK_EMBED_PLAYER_LIFETIME | Mode, URL update, remove/Undo, destroy. | Intended player/preview/control lifecycle; no obsolete player leak. |
| BLOCK_RAW_ROUNDTRIP | ROUNDTRIP raw. | **Accepted on `069ae946`, Chromium 142:** exact default/populated textarea source, benign renderer markup, mode/source disclosure, trusted input and one native Undo/Redo. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#raw-roundtrip-parity-2026-10-29). |
| BLOCK_RAW_SOURCE | Multiline source Tab/Shift+Tab and native selection. | Inert source meaning, one indentation edit, content/selection replay. |
| BLOCK_RAW_PREVIEW | Preview/source/read-only round trip. | Source caret and automatic preview retained; view/mode change is not authoring. |
| BLOCK_RAW_NAVIGATION | Controlled permitted external/fragment/named links and file download. | Actual intended destination/download remains; stripping attributes is not parity. |
| BLOCK_RAW_PRESENTATION | Tall/responsive themed HTML with native media. | Reachability, formatting and permitted controls/playback while confined; B-HTML required. |
| BLOCK_GALLERY_ROUNDTRIP | ROUNDTRIP gallery. | Common roundtrip oracle. |
| BLOCK_GALLERY_SOURCES | Multi-file/uploader/action batch, cancellation and member failure. | Existing batch/names/URLs and one-action semantics; provisional resources released. |
| BLOCK_GALLERY_LAYOUT | Every declared layout, resize, detach/reinsert, update. | Correct order/layout with scoped observers/frames, no stale sizing. |
| BLOCK_GALLERY_CAPTION_ORDER | Rich captions, reorder/remove and replay. | Item IDs/captions/sidecars/order correct. |
| BLOCK_GALLERY_APPEARANCE_VIEWER | Appearance and declared loop/zoom/navigation/captions/thumbnails/fullscreen/autoplay interval. | All existing viewer options work and dispose; no generic media rewrite. |
| BLOCK_CAROUSEL_ROUNDTRIP | ROUNDTRIP carousel. | Common roundtrip oracle. |
| BLOCK_CAROUSEL_MIXED | Mixed image/video/HTML through URL/file/action sources. | All kinds, poster/alt/caption/IDs/order supported. |
| BLOCK_CAROUSEL_STRUCTURE | Add/remove/reorder, including active-slide removal. | Supported next-active and order; neighboring media not lost. |
| BLOCK_CAROUSEL_CONTROLS | Loop/navigation/pagination/thumbnails in editor/output. | Each declared control and saved option retained. |
| BLOCK_CAROUSEL_AUTOPLAY | Autoplay/loop/delay/aspect ratio, stop/remove. | Browser-permitted playback and timer lifetime; HTML repair does not disable controls. |
| BLOCK_CAROUSEL_HTML | Benign themed linked/downloadable tall HTML slide. | Usable editor/output and confinement without link-loss or fixed-viewport shortcut. |
| BLOCK_CAROUSEL_TASKS | Sources resolve/reject after edit/mode/replacement/destroy. | Correct selective task lifetime/URL cleanup and completed history. |
| BLOCK_ATTACHES_ROUNDTRIP | ROUNDTRIP attaches. | **Accepted on `ab1c73ea`, Chromium 142:** actual empty/default and populated files, literal names, renderer output, current mode ownership, trusted first-name input and exact native history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#attaches-roundtrip-parity-2026-10-29). |
| BLOCK_ATTACHES_FILES | Single and multiple local/upload/action files. | Both capabilities via current files array; no old singular-wire decoder. |
| BLOCK_ATTACHES_NAMES_VARIANTS | Supported rename/reorder and a/b/f/g variants. | Metadata/display/order retained; meaningful names not normalized away. |
| BLOCK_ATTACHES_DOWNLOADS | Individual and ZIP download on controlled attachments. | Files/names/quotas, cancellation and failed-sibling cleanup. |
| BLOCK_ATTACHES_LIFETIME | Failed commit/cancel/destroy during read/fetch/export. | No provisional URL/stream/task leak or late publication. |
| BLOCK_LINK_PREVIEW_ROUNDTRIP | ROUNDTRIP linkPreview. | Common roundtrip oracle. |
| BLOCK_LINK_PREVIEW_TEMPLATES | horizontal, compact, large-top, minimal, twitter, notion, split. | Seven distinct editor/output presentations retained. |
| BLOCK_LINK_PREVIEW_METADATA | URL with/without fetchMeta; edit fields before result. | URL accepted immediately; only untouched fields enriched; no implicit request without provider. |
| BLOCK_LINK_PREVIEW_HISTORY_CONTINUATION | Adjacent URL metadata completion, then intervening edit variant. | Only qualified adjacent action merges; unrelated edits do not; restoration does not restart automatic enrichment. |
| BLOCK_LINK_PREVIEW_NAVIGATION | Click editable, read-only and renderer cards. | Editable card does not navigate; permitted reader/output link does. |
| BLOCK_LINK_PREVIEW_CANCELLATION | Replace URL/destroy before delayed resolve/reject. | Old result cannot overwrite new data or leak rejection. |
| BLOCK_TOGGLE_ROUNDTRIP | ROUNDTRIP toggle. | **Accepted on `5d1a39b4`, Chromium 142:** actual closed default, open/closed populated widgets, both field identities, disclosure/accessibility state, rendering and native title history. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#toggle-roundtrip-parity-2026-10-29). |
| BLOCK_TOGGLE_FIELDS | Both rich fields/widgets, collapse/expand. | Hidden values and selection/content retained. |
| BLOCK_TOGGLE_STATE | Authored open, save/render/replay. | Persisted state reproduced, unlike transient Spoiler disclosure. |
| BLOCK_TOGGLE_CUT | Compound cut with empty markup or visible residual. | Only empty source removed; visible content/authored state preserved. |
| BLOCK_COLUMNS_ROUNDTRIP | ROUNDTRIP columns. | **Accepted on `43254ba6`, Chromium 142:** default/populated fields, fixed IDs/order/layout, independent widgets, renderer columns and one native first-column Undo/Redo. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#spoiler-and-columns-roundtrip-parity-2026-10-29). |
| BLOCK_COLUMNS_LAYOUTS | 1-1, 1-2, 2-1, 1-1-1. | Supported widths/counts and controls retained. |
| BLOCK_COLUMNS_NO_LOSS_REDUCE | Distinct rich fields/widgets, three→two→three, Undo. | Nonblank removed column appends to second with break; expansion adds empty last; no sidecar loss. |
| BLOCK_COLUMNS_FIELDS | Independent edit/format/select/convert. | IDs/order and hidden/unselected content retained; wrong-layout input remains strict. |
| BLOCK_SPOILER_ROUNDTRIP | ROUNDTRIP spoiler. | **Accepted on `a03dfd87`, Chromium 142:** default/populated label and content, field identities, transient disclosure/accessibility, renderer slots and one native label Undo/Redo. [Evidence](/architecture/rector-v2/PUBLICATION_REVIEW#spoiler-and-columns-roundtrip-parity-2026-10-29). |
| BLOCK_SPOILER_FIELDS | Label/hidden content marks/widgets. | Both values retained, including concealed text. |
| BLOCK_SPOILER_DISCLOSURE | Mouse/keyboard disclosure and remount. | Transient expanded/ARIA behavior, no invented persistent field/history. |
| BLOCK_SPOILER_CUT | Cut label/body with formatting-only remnants. | Remove only fully empty source; other field retained. |
| BLOCK_POLL_ROUNDTRIP | ROUNDTRIP poll. | Common roundtrip oracle. |
| BLOCK_POLL_AUTHOR | Question/options/order, single/multiple and always/afterVote/hidden results modes. | Stable options and authored configuration/initial results preserved. |
| BLOCK_POLL_LOCAL | Single/multiple vote/revote with known totals. | Correct ballot denominator/counts; runtime results are not arbitrary author history. |
| BLOCK_POLL_REMOTE | Controlled load/vote/subscription, currentUserVote and voter details. | Declared parameters, revisions/order, load and live updates retained. |
| BLOCK_POLL_RACE | Out-of-order results, rejected/double vote, midrequest disposal. | No stale/duplicate unauthorized effect; cancellation and truthful outcomes. |
| BLOCK_POLL_RENDERER | Interactive output config and static/no-provider fallback. | Published runtime/cleanup independent from editing author state. |
| BLOCK_PERSON_ROUNDTRIP | ROUNDTRIP person. | Common roundtrip oracle. |
| BLOCK_PERSON_CARDS | Add/edit/remove/reorder profiles, roles/bios/links. | All profiles/IDs/order and non-name content preserved. |
| BLOCK_PERSON_HIDDEN_FOCUS | First profile → Second named field/caret in one request. | Correct reveal and first true result/caret without history. |
| BLOCK_PERSON_READONLY_TABS | Reader tabs and attempted author edit. | All profiles inspectable; tab is transient; writes denied. |
| BLOCK_PERSON_AVATAR | Crop/upload, foreign document and enforcing Trusted Types. | Crop supported; original-file fallback retains filename/MIME without global permissive policy. |
| BLOCK_PERSON_LINKS | Built-in/custom socialResolvers and multiple output cards. | Links/icons/navigation and carousel lifetime preserved with URL policy. |
| TOOL_BOLD_ACTION | TOOL: toggle mixed/partial/existing bold. | Common tool oracle. |
| TOOL_ITALIC_ACTION | TOOL: toggle mixed/partial/existing italic. | Common tool oracle. |
| TOOL_STRIKETHROUGH_ACTION | TOOL: toggle nested strikethrough and remove. | Common tool oracle without text loss. |
| TOOL_LINK_ACTION | TOOL: panel Apply/Enter/update/unlink, targets and auxiliary focus. | Common tool oracle; passing Apply/Enter remain controls. |
| TOOL_CODE_ACTION | TOOL: inline code on/off. | Literal source, boundaries and widget exclusions preserved. |
| TOOL_MARKER_ACTION | TOOL: highlight on/off. | Common tool oracle; neighboring styles/widgets retained. |
| TOOL_BGCOLOR_ACTION | TOOL: choose/reset background, cancel/teardown, realm/Trusted Types. | Common tool oracle with owned popover cleanup. |
| TOOL_FONTSIZE_ACTION | TOOL: presets/custom UI value, partial selection and cancel. | Common tool oracle; accepted non-UI sizes survive unrelated edits. |
| TOOL_SCRIPT_ACTION | TOOL: Superscript/Subscript/Normal while panel has auxiliary focus. | Panel capability throughout, one action, no stale mount selection. |
| TOOL_ALIGN_ACTION | TOOL: left/center/right/justify on relevant selection. | Intended alignment without rewriting author text. |
| TOOL_CASETRANSFORM_ACTION | TOOL: supported selected-text case changes. | Marks/widgets/unselected characters preserved. |
| TOOL_CLEARFORMATTING_ACTION | TOOL: clear supported selected author formatting. | No unrelated content or widget payload removal. |
| INLINE_MENTION_QUERY | Trigger/multiple queries/pagination, keyboard/pointer choice; configured Unicode trigger/debounce/loading/no-results/custom rows/avatar/details/cursor/onMentionSelect. | Current popup/search ownership, chosen sidecar/trailing text, config snapshot, original callback ID, detached-row styling/ARIA and per-editor isolation. |
| INLINE_MENTION_LABEL | Character/word/line deletion, replacement and label-local cut/paste; leave widget. | Identity/label rules and native selection/gesture; trigger removal releases search/identity. |
| INLINE_MENTION_LIFETIME | Query/caret/mode/document/destroy before results. | Only current session can present/commit; old handles cannot close successor. |
| INLINE_MENTION_OUTPUT | Save/render known/unregistered refs, literals and own-key IDs. | Payload/current widgets retained; unknown inert; no legacy DOM-marker hydration. |
| INLINE_COLOR_INSERT_EDIT | Pattern/public insert and widget update. | Correct sidecar/value/swatch and one admitted action. |
| INLINE_COLOR_ROUNDTRIP | Split/merge/copy/render actual and literal color refs across fields. | Mapping/sidecars and literal text retained. |
| INLINE_COLOR_LIFETIME | Remove/reproject then retained callback. | Retired occurrence cannot edit successor or destroy foreign resources. |
| PUBLIC_SNAPSHOTS | get/at/list/indexOf/iterator/count/currentId; mutate nested snapshots. | Coherent detached/read-only results, no model/history alias. |
| PUBLIC_STRUCTURE | Insert/update/remove/move/default, final-block removal and nested draft edits. | Data/IDs/order/default/no-op and one-action semantics. |
| PUBLIC_RENDER_CLEAR | Current envelope render/save/clear/replay, including equal replacement. | Version/identity/generation and replacement history retained. |
| PUBLIC_SELECTION | setCurrent/select/clearSelection with stale/live IDs and roots. | Control state, not authoring; focus remains distinct. |
| PUBLIC_READONLY | Mode round trip, availability/events and reader controls. | History retained but authoring unavailable; view-only controls usable. |
| PUBLIC_EVENTS | Ready/current/selection/document/history/destroy subscription, throw/reject and unsubscribe. | Fact order and independent fan-out; rejection neither rolls back accepted data nor grants stale rights. |
| PUBLIC_DESTROY | Repeated destroy/retained APIs/panels/listeners; reacquire holder. | Old handle inert, resources/lease released and other editor unaffected. |
| HISTORY_GESTURE | Typing groups, explicit boundaries, structural action and replay. | Existing grouping/selection snapshots and discrete gesture count. |
| HISTORY_ATOMICITY | Caught nested falsy throw, apply failure, recovery failure, later command. | No partial acceptance/cursor move; recoverable usable, terminal explicit. |
| HISTORY_CONTINUATION | Adjacent metadata, unrelated edit and changed same field. | Only qualified continuation, no global over-revocation or unrelated merge. |
| HISTORY_BUDGET | Count-only versus explicit bytes with coalesce/replay/branch. | Disabled behavior unchanged; enabled newest action undoable, truthful depths and atomic plans. |
| NATIVE_TYPING | Trusted text/replacement/deletion, Unicode/BR/empty. | DOM/model/caret agree, no guessed stale-field write. |
| NATIVE_IME | Actual supported confirmation/cancel; mode/destroy during composition. | No duplicate commit/lost confirmed text; cancelled/stale composition cannot author. |
| NATIVE_KEYBOARD | Enter/Backspace/Delete/arrows/shortcuts through capabilities. | Valid-field behavior retained; auxiliary controls/native defaults keep ownership. |
| CLIPBOARD_LOCAL | Forward/backward partial rich/plain private-MIME/HTML/text copy/cut/paste. | Residuals/marks/sidecars, one gesture; failed/empty write cannot delete. |
| CLIPBOARD_CROSS | Compound multi-field selection between independent editors. | Selected content/residual endpoints, collision-free identity remap. |
| CLIPBOARD_HTML_ROOTS | Two paragraph roots versus table/image-first into local selection. | Text-first replaces range; structural-first preserves baseline source text, atomically. |
| CLIPBOARD_FILES | Async multiple file/pattern routes and cancellation. | Deterministic accepts/routing and no producer after revocation. |
| CLIPBOARD_WIRE | Strict current wire, unregistered inline records and malformed/versionless input. | Unknown data retained inert; malformed/legacy rejected, no silent metadata deletion. |
| CONVERSION_GROUPING | Mixed logical selections through toolbox/replay. | Selected semantics and unselected fields preserved; capability rejection atomic. |
| UI_SLASH | Open/filter/keyboard/confirm/cancel then retain stale session. | Declared choices/eligibility; no action on revoked selection/mode. |
| UI_BLOCK_TOOLBAR | Block/settings/source actions then retained buttons. | Labels/order/eligibility and commands; stale controls inert, no type-name interpretation. |
| UI_DRAG | Pointer/keyboard reorder/animation, cancel/revoke midgesture. | Correct order/history/focus; no stale listener or foreign DOM deletion. |
| UI_NATIVE_SELECTION | Forward/backward cross-field pointer/keyboard highlights with widgets/BR/two editors. | Correct logical/highlight owner; auxiliary native focus not stolen. |
| EXTENSION_SCHEMA | Third-party schemas/capabilities and invalid asynchronous returns. | Declared extensibility without private imports; invalid thenables rejected/contained. |
| EXTENSION_LIFETIME | Share definitions, recreate same ID, dispose one editor. | Per-editor/occurrence isolation; retired rights cannot transfer. |
| EXTENSION_DATATASK | Resolve after unrelated block edit, then mode/replacement/destroy controls. | Valid unrelated work survives; real invalidation rejects before producer. |
| EXTENSION_POPUP | Detached popup, reentrant successor, old handle close. | Exact creating owner controls cleanup; foreign connected DOM not stolen. |
| EXTENSION_TOOLS | Third-party mount/panel/labels and retirement inside callbacks. | Published ports suffice; separate leases and independent teardown after failure. |
| RENDERER_CONSTRUCTION | Subclass public EditorRenderer with super; baseline forwarding factory control. | **Accepted on candidate `4b87dad0`, Chromium 142:** sole retained constructor preserves overrides/registration; only spelling migrates. See [construction evidence](/architecture/rector-v2/PUBLICATION_REVIEW#construction-parity-2026-10-29). |
| RENDERER_OUTPUTS | renderBlock/render/renderTo stable revisions, dispose target/all then reuse. | **Accepted on candidate `6b0ef0e8` (published `a39aaf32`), Chromium 142:** 27 public-boundary cases prove output ownership, producer-revision shortcut, incremental reuse and target/all disposal. [Three-source evidence](/architecture/rector-v2/PUBLICATION_REVIEW#renderer-output-parity-2026-10-29) classifies repaired foreign-DOM/aggregate-root defects. |
| RENDERER_REGISTRATION | Register/unregister/reregister with retained old output. | Old output uses originating disposer; new registry controls new output only. |
| RENDERER_ERRORS | Unknown type/version, validation observer throw/reject. | Deterministic validation and prior DOM preservation; observer cannot replace authoritative error. |
| PACKAGE_ASYNC | Single/list/document factories, duplicates/unknowns/config errors. | Distinct operations/order/errors preserved; explicit unknown-list and unloaded-document routes are not conflated. |
| PACKAGE_EXPORTS | Pack/install without sibling repos; wildcard/subpaths/types/assets. | Canonical exports/types/styles/locales work; removed aliases fail without useful feature loss. |
| APPEARANCE_STYLES | injectStyles true/false, custom CSS/classPrefix/theme and two realms. | Host integration retained; references/release limited to owned styles. |
| APPEARANCE_I18N | Bundled/custom dictionaries, missing keys/plural/interpolation. | Labels/fallback retained, translated labels not command IDs. |
| RESOURCES_REALM | Foreign document, compatible enforcing CSP/Trusted Types, shared definition. | No ambient DOM borrowing/global permissive policy; supported realm fallbacks remain. |
| RESOURCES_FAILURE | Failure at acquisition/cleanup, then remount holder. | Failed construction restores original holder; independent resources released; no automatic composition rewrite. |
| RESOURCES_STEADY | Bounded edit/mount/history stress. | No monotonic unintended retention; compare measurements, not arbitrary heap claims. |
| PRESENTATION_VALUES_FONT_1 | FONT: 16px. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** CSS meaning survives, not merely sanitized spelling. |
| PRESENTATION_VALUES_FONT_2 | FONT: 16.5px. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** Fractional size preserved. |
| PRESENTATION_VALUES_FONT_3 | FONT: 1.5em. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** Relative meaning preserved. |
| PRESENTATION_VALUES_FONT_4 | FONT: 150%. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** Percentage meaning preserved. |
| PRESENTATION_VALUES_FONT_5 | FONT: 1.5rem. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** Root-relative meaning preserved. |
| PRESENTATION_VALUES_FONT_6 | FONT: calc(10px + 1em). | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** Computed meaning preserved. |
| PRESENTATION_VALUES_FONT_7 | FONT: 201px. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** No imported-document cap at UI maximum. |
| PRESENTATION_VALUES_FONT_8 | FONT: 250px. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** No imported-document cap at UI maximum. |
| PRESENTATION_VALUES_FONT_9 | FONT: inherit. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** Host inheritance preserved. |
| PRESENTATION_VALUES_CLASS_SPAN | Benign article-accent span host rule and neighboring edit. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** Class meaning/style retained; hostile collision is a separate negative. |
| PRESENTATION_VALUES_CLASS_CODE | Benign code class/lang and neighboring edit. | **Accepted on `1a2477fa` (published `4f1ccfd3`), Chromium 142:** Host/code presentation retained; hostile collision separately tested. |
| PRESENTATION_VALUES_TARGET_SELF | TARGET: _self. | Actual permitted requested destination. |
| PRESENTATION_VALUES_TARGET_BLANK | TARGET: _blank. | Actual permitted requested destination with rel/platform semantics. |
| PRESENTATION_VALUES_TARGET_PARENT | TARGET: _parent. | Actual permitted requested destination under controlled parent context. |
| PRESENTATION_VALUES_TARGET_TOP | TARGET: _top. | Actual permitted requested destination under controlled policy. |
| PRESENTATION_VALUES_TARGET_ARTICLEPREVIEW | TARGET: articlePreview. | Actual platform-supported named-target behavior, no invented reuse guarantee. |
| FOCUS_VALUES_OFFSET_1 | Already focused alpha/text, request 2. | True, logical 2, no history. |
| FOCUS_VALUES_OFFSET_2 | Already focused alpha/text, request 2.9. | True, logical 2, no history; truncation retained. |
| FOCUS_VALUES_OFFSET_3 | Already focused alpha/text, request -2. | True, logical 0, no history; clamping retained. |
| FOCUS_VALUES_OFFSET_4 | Already focused alpha/text, request 1000. | True, logical 5, no history; clamping retained. |
| FOCUS_VALUES_OFFSET_5 | Already focused alpha/text, request start. | True, logical 0, no history. |
| FOCUS_VALUES_OFFSET_6 | Already focused alpha/text, request end. | True, logical 5, no history. |
| DEFECT_FIRST_FOCUS | Focus a then request b/text/offset2 once. | True at b/2, no partial publication. |
| DEFECT_ELEMENT_RANGE | Same alpha selected with Text offsets/selectNodeContents, trusted Bold. | Same formatting/action; foreign/stale selection still denied. |
| DEFECT_SCRIPT_PANEL | Select alpha, auxiliary panel focus, trusted Superscript. | Panel-owned action commits once; stale panel inert. |
| DEFECT_HTML_OVERLAY | Fixed/inset/high-z payload on all four Raw/Carousel surfaces. | Cannot cover/capture unrelated UI; benign navigation/layout/media independently proved. |
| CONTRACT_FAILED_PUBLIC_DISPOSAL | Block apply and recovery creation throw; after public call unwinds read data, deny write, destroy twice and reacquire holder. | Accepted data intact, zero rejected producer, instances/signals/root/lease released once; active guarded destroy remains denied. |
| CONTRACT_RETIRED_TASK_OPTIONS | Cancelled/consumed/mode-revoked task with getter-backed merge option. | False with zero getters/producers and no edit/history. |
| CONTRACT_ACTIVE_TASK_OPTIONS | Live task options try host write and recursive same-task commit. | One guarded supported read; no nested host producer or stolen reservation; invalid preflight can retry while live. |
| CONTRACT_INLINE_OPTION_CAPTURE | Live and retired inline update with getter-backed trailingText. | Live one-read guarded capture, no independent host edit; retired reads/calls neither getter nor producer. |
| CONTRACT_TASK_SETTLEMENT | No-op, invalid preflight, throwing producer and second commits. | No-op true/consumed with no history; entered failure consumed/aborted; valid retry after input failure; accepted remount may abort signal while true. |
| CONTRACT_BLOCK_INLINE_CONTINUATION | Paired block/inline url/title metadata, mergeWithPreviousField=url then Undo. | Qualified block grouping; independent inline action; true does not promise merge and no data lost. |
| CONTRACT_ASYNC_OBSERVER_ADMISSION | Publication callback attempts command synchronously and after controlled await. | Synchronous producer denied; later live idle command is a separate action; dead tokens remain dead. |
| CONTRACT_DEFERRED_DIAGNOSTIC | Guarded metadata collection then queued onDiagnostic uses live public update. | Collection content-free/protected; later command independently admitted, no recursive rollback or automatic retry. |
| CONTRACT_FAILED_MODE_DISPOSAL | Unrecoverable read-only transition then public destroy/reacquire. | Existing working cleanup preserved, old signals retired, renderer lifecycle not conflated. |
| CONTRACT_INLINE_OPTIONAL_UPDATE | Valid no-update inline, alpha→beta context update and replay. | Accepted model/DOM agree; same author reference, new scope when required. |
| CONTRACT_INLINE_OPTIONAL_TASK | DataTask beta on no-update inline then replay. | True/coherent one action; old contexts/tasks cannot bind to successor. |
| CONTRACT_INLINE_OPTIONAL_IMMEDIATE | editing.handle returns update/beta/caret2 without native opt-in. | Accepted DOM beta and exact resulting caret; later successor/user selection wins. |
| CONTRACT_OPTIONAL_NOOP_REUSE | Unrelated edit then canonical no-op on optional instance. | Same occurrence and independent valid task; no no-op history. |
| CONTRACT_OPTIONAL_RECREATE_FAILURE | New no-update occurrence creation/apply rejects beta. | Prior alpha model/DOM/history recovered; provisional resources revoked; no silent beta cache. |
| CONTRACT_INLINE_SYNC_UPDATE_CONTROLS | Existing update throws or returns rejected Promise/thenable. | Recover alpha, no accepted event/history or unhandled rejection; no silent recreation fallback. |
| CONTRACT_NATIVE_RECONCILE_UPDATE_REQUIRED | Opt-in reconcileNative without update versus ordinary optional instance. | Invalid opt-in rejected/cleaned; ordinary optional instance still valid. |
| CONTRACT_TASK_SUCCESS_RETIRES_OWNER | Changed no-update block task versus in-place/no-op, with second pending task. | Accepted remount returns true with old signal aborted/pending task denied; no-op/in-place preserves independent work. |
| CONTRACT_MODE_FALSY_RECOVERY | Two-block transition: forward B Error, reversal A throws each falsy value. | Previous actual/public modes restored or explicit terminal recovery failure, never silent healthy mismatch. |
| CONTRACT_MODE_RECOVERY_CONTROLS | Pair Error and inline failures with ordinary successful mode round trip. | Existing reconstruction preserved; successful transition does not remount. |
| CONTRACT_MODE_RECOVERY_TERMINAL_DISPOSAL | Forward, reverse and committed-projection restoration fail. | Accepted model readable, new producer denied, public disposal releases holder. |
| CONTRACT_READ_GUARDED_INLINE_DECODE | Registered live inline decoder attempts sibling host write during getData. | Valid decoded read or authoritative error; zero nested host producer/event. |
| CONTRACT_READ_REVOKED_INLINE_DECODE | Hold exact old context across retirement, then read. | Abort before decode/producer; newly acquired context is not the subject. |
| CONTRACT_READ_PRESERVED_MODES_AND_DATA | Normal/read-only/legitimately staged decoded reads then ordinary later command. | Readability and decoded meaning retained; no raw-data shortcut/global lock. |
| CONTRACT_PROJECTION_REGISTERED_DECODE_FAILURE | Known decoder succeeds input then fails projection during public update. | Prior accepted model/DOM/history recovered; failure not hidden as accepted literal output. |
| CONTRACT_PROJECTION_UNKNOWN_INLINE_CONTROL | Unregistered type with opaque payload, update and output. | Inert marker/data preserved, unavailable runtime not invoked. |
| CONTRACT_PRESENTATION_BATCH_INDEPENDENCE | Two standalone field changes in one observer batch; bounded A create failure. | Independent B delivery preserved, canonical/history unchanged, A reaches settled diagnostic/recovery owner. |
| CONTRACT_PRESENTATION_LOCAL_RECOVERY_PRESERVATION | Fail/retry presentation while unrelated native input/tasks/selection are pending. | No global rollback, lost input, revived rights or unbounded observer loop. The standalone contract is settled in specification §16.5 and implemented in the combined core continuation; this differential row retains its own complete proof obligation. |

## Closure rules

The blocks/tools/inline counts come from their canonical registries, not from this table alone. ROUNDTRIP is only basic coverage. Settings variants, sources, retained data and third-party conditional capabilities remain mandatory even when a simple fixture passes.

T00–T32 and C01–C12 in the specification identify proof families and owners. Earlier detailed attachment clause references are historical; use the named contract and current section, not an old numeric subsection offset. Mode recovery is C07/read-only recovery, protected reads are C07/protected inline reads, and standalone refresh is C12/B-PRESENTATION.

A row closes only with a recorded candidate identity, executed trigger, independent expected observations and retained positive/negative controls. A new spec paragraph, original-source counterexample, unit total, DOM attribute assertion or missing execution environment does not close it. Keep current, v1 and candidate traces distinct. Final convergence requires the entire union, not only this pass's executed subset.
