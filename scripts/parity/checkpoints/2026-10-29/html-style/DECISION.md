# E-HTML / E-STYLE decision memo

**Status: investigation complete within this bounded slice; policy remains
unsettled. No production or dependency change is approved by this memo.**

The governing requirements are C05/B-HTML and C06/B-STYLE in
`RECTOR_V2_CONTRACT_AND_BOUNDARY_REFACTOR_SPEC.md`. Preservation and confinement
must both hold. A class/target/HTML removal, fixed tiny viewport or new cap is not
a substitute for the requested behavior. Exact experiment identities and
reproduction requirements are in [README.md](README.md).

## 1. Current failures and preserved capabilities

The same viewport-covering fixed HTML intercepts an outside trusted host click
in Raw renderer and Carousel editor in both v1 and the pinned current source.
Sanitizing active script does not prevent that layout effect. A native popover
also escapes scratch `contain:layout paint`. In untouched Carousel renderer,
keyboard Enter already opens a host-covering popover even while its pointer
activation is broken. These are existing boundary failures, not newly introduced
v1 regressions or an approved security state.

Raw editor's opaque sandbox confines those surfaces, but its preview stays at 150 px
for a 1117 px document, loses implicit host theme and navigates local fragments
away from its original srcdoc. A download attribute survives but clicking it
navigates the child to the resource instead of downloading it. Named targets are
removed by the current Raw sanitizer. Those inherited deficiencies must not be
reintroduced as preservation requirements.

Useful positive controls are equally concrete: same-document Raw renderer and
Carousel editor preserve the tested local fragments, downloaded filename, host
theme, long content, narrow responsive width, focusable tail and native video
Space playback. Inline Paragraph editor/renderer preserve all nine required
font-size forms, benign span/code classes and code language. Actual self/blank/
named target effects match an independent bare Chromium control with the same
required rel. These capabilities constrain any replacement.

The hostile inline class test also fails: allowed `app-screen-cover` activates
host CSS positioning a span across the full 1100×800 viewport and intercepts a
host action. The class is safe syntax; its meaning comes from the host stylesheet.

## 2. Ready upstream proposal, separate from HTML isolation

The pointer activation defect belongs to the external Carousel swipe plugin.
Rector registers `createSwipe({mouse:true})`; the plugin captures the viewport on
pointerdown, before deciding whether a drag exists. Trusted pointerup/click then
arrive at the viewport instead of the original anchor or button. Omitting only
swipe installation in a scratch control restores real fragments, downloads and
native button activation.

Official npm metadata was read on 2026-10-29 at 15:37 UTC: only version 1.0.0 exists
and `latest` is 1.0.0. Public upstream master is
`9896ddf60e594501b612ce38dbac66270f93181e`; it still has the early-capture behavior,
its package version is 1.0.0 and GitHub tags/releases were empty. These are dated
observations, not a promise about future releases. Primary endpoints:

- https://registry.npmjs.org/@shelamkoff%2fcarousel
- https://api.github.com/repos/Shelamkoff/carousel/commits/master
- https://raw.githubusercontent.com/Shelamkoff/carousel/9896ddf60e594501b612ce38dbac66270f93181e/src/plugins/swipe.js

The existing API provides `use`, `getPlugin`, and plugin install/destroy
lifecycle. It has no native-target admission hook or enable/disable operation;
`update` rejects replacing plugins. Disabling mouse, destroying swipe or adding
a local propagation-stopping renderer guard would not preserve the same contract.

A first proposed capture deferral failed native range dragging and is retained
as a rejected proposal. The corrected patch extends the existing upstream
`onDown` admission check so native controls and editable fields own their input.
It does not add a public option, a listener, a local renderer adapter, a second
swipe engine or event suppression.

Exact upstream master plus the corrected patch passes the bounded 8-case corpus
through the actual public Rector renderer: trusted fragment, downloaded
`local-proof.txt`, native popover, checkbox, video Space playback, native range
drag(value 86, slide 0), ordinary mouse swipe(slide 1), and destroy during drag.
All pointer cases still deliver one bubbling pointerdown to the outside document.
The unchanged published/master controls remain red. Master also contains other
gesture changes, so using a Git dependency is not a proven release upgrade.

**Next executable production path:** independently review the prepared patch,
obtain authorization for the upstream repository/release action, satisfy upstream
tests/types/build and broader native gesture/media checks, then integrate a fixed
published package into Rector and run its package/browser gates. No cross-repo
publication or npm release was attempted. Touch/platform breadth and full native
media pointer controls remain unverified;8/8 is not a complete upstream release
acceptance or a closure of B-HTML.

## 3. Narrow iframe direction: demonstrated properties and two blockers

The bounded prototype uses a scriptless sandbox with the single
`allow-same-origin` token so the existing parent owner can measure its document
and attach listeners. It does not grant scripts, top navigation, popups or
downloads to the frame. Parent link delegation requires the exact current child
document, a connected live frame, active lifetime, trusted event and current
user activation. It resolves local fragments in srcdoc and uses a synchronous
host-owned anchor for tested permitted external targets/downloads. The projected
sanitizer experiment preserves `target`; source/model JSON is unchanged.

With a deliberately supplied host-owned content stylesheet, the corrected
prototype passes 6/7 tested properties: ordinary 1167 px content with the intended
30 px themed heading; responsive 420 px host width; focusable tail and advancing
native video playback; actual local fragment; actual download filename; named
window navigation; confined native popover; and no navigation from the tested
synthetic/disposed-link paths. Some of those observations are grouped within a
single test property. The parent enforces nonce-restricted scripts and Trusted
Types, with authored style attributes explicitly allowed. No arbitrary host
stylesheet was copied. This is a topology experiment, not integrated Raw/
Carousel history or a general CSP/realm/accessibility acceptance.

Two concrete blockers remain:

1. **Style ownership.** Without the explicit content asset, the same frame loses
   the benign host class/theme. Existing `injectStyles`, editor theme, renderer
   classPrefix and plugin css URLs do not establish a shared content-realm theme
   contract for all four surfaces. The frame cannot be said to preserve arbitrary
   implicit document styles. Copying all host CSS is expressly outside the agreed
   target. A justified explicit host style input or another demonstrated owner
   boundary must be designed before C05/C06 can be amended; no new public option
   is adopted implicitly by this prototype.
2. **Viewport-relative layout.** Ordinary margin-aware height measurement works,
   but `height:calc(100vh + 20px)` creates a feedback loop because changing frame
   height changes the author's viewport unit:186→222→258→…→1014px. The probe stops
   after 24 measurements only to bound its own execution. A product height cap,
   resize freeze, fixed scrolling viewport or removal/rewrite of the author's CSS
   is not accepted. The intended reference viewport and sizing behavior need an
   agreed contract and a demonstrated engineering solution.

The prototype's load handler also binds callbacks again on a subsequent
accessible document load; it does not prove that this is still the originally
admitted source generation. The tested synthetic/disposed-link negatives do not
cover navigation-driven replacement. Production admission would have to reject
unexpected document replacement and use the existing view generation/lifetime,
not treat any later same-origin document as the accepted source. This is a
source-review limitation of the prototype, not a newly demonstrated production
regression.

Other unproven obligations include modifier/middle-click/context-menu navigation,
full-screen/media pointer controls, resources/credentials, all four integrated
surfaces, ownerDocument variants, CSP configurations, error recovery, update/
Undo/Redo and disposal beyond the narrow negative control. The selected
`allow-same-origin` experiment is not a blanket claim that same-origin HTML is
safe, nor approval of any broader sandbox flags.

**Recommendation:** keep this as a concrete candidate direction and retain
B-HTML. Decide the source of content styles and the semantics of viewport-relative
layout first; then implement one coherent topology at the existing Raw/Carousel,
style and lifecycle owners. Do not select a cap/fallback or add a parallel mode
to make this prototype appear complete.

## 4. Inline class trust cannot be inferred from syntax

A generic inline sanitizer sees the same class token whether the host defines
it as a benign color or a page-covering positioned surface. The tested current
configuration supplies style resources and theme settings, not semantic trust
for arbitrary class meanings. Preserving class names therefore does not itself
prove confinement; blanket removal would fail the positive corpus.

A future policy must demonstrate either an owner boundary that confines the
relevant effects while preserving presentation and author interaction, or a
justified host-owned style/trust input. That decision belongs at the existing
sanitizer/style ownership contract. It must not be a serialized content-controlled
trust switch, default class allowlist, forced target rewrite or font-size cap.
Moving inline editing into frames would also change native selection/history
ownership and is not an automatic consequence of the Raw experiment.

**Recommendation:** retain the proved non-destructive typography/target behavior,
record the concrete hostile-class failure, keep B-STYLE open, and amend C06 only
after one candidate policy demonstrates both preservation and confinement.
This memo awards no additional preservation row and makes no full-parity claim.
