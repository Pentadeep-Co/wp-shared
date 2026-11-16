---
name: figma-to-wordpress
description: "Translate a Figma file whose layers are named with the element/[.classes] convention into a properly structured WordPress block theme — scaffolding, template parts, patterns, templates, block markup, and theme.json presets — tracked as a resumable task list. Use when building or extending a theme from a Figma design, when scaffolding a new theme, when reading a Figma node tree, when resuming a design build across sessions, or when deciding which block a layer becomes. Triggers on: Figma, figma.com design URL, node-id, layer naming, design to code, design handoff, get_metadata, get_design_context, get_variable_defs, download_assets, pattern[, part[, Page--, Overlay--, group<section>, BEM layer names, block markup from design, theme.json from Figma variables, design tokens, scaffold a theme, new-theme, wp-build new-theme, PROJECT.md, resume the build, Figma annotations, @query annotation, ACF custom post type, custom block, icon block, block bindings, theme accessibility, aria attributes, focus order, breakpoint frames, responsive variants, --768, --390, which block should this be."
metadata:
  short-description: Build WordPress block themes from Figma files that use the element/[.classes] layer-naming convention
---

# Figma → WordPress block theme

A design file in this convention is not a picture to eyeball — it is a **typed
source tree**. Every converted layer name declares the HTML element it becomes
and the CSS classes it carries, and the frames above it declare whether the
subtree is a page, a template part, or a pattern. Read the names and the theme's
structure falls out; guess from the screenshot and you will invent structure the
designer already decided.

This file is the grammar, the rules, and the phase map. The detail lives in
`references/`, read at the phase that needs it:

| Phase | Reference | What it carries |
|---|---|---|
| 0 Scaffold | `references/scaffolding.md` | repo-shape detection, what a theme must have, the scripts and their constraints |
| 1 Extract | `references/figma-extraction.md` | the whole-file read, to disk, and the artifact layout |
| 2 Plan | `references/project-file.md` | PROJECT.md — tasks, dependencies, acceptance criteria, the flag ledger |
| 3 Build | `references/design-tokens.md` | variables and styles → `theme.json`, base and utility classes |
| | `references/block-mapping.md` | element hint → block markup |
| | `references/css-architecture.md` | layer order, nesting, fluid sizing, responsive derivation |
| | `references/accessibility.md` | aria per element, focus order, what to verify |
| | `references/name-grammar.md` | malformed and unconverted names: recover, or skip and flag |
| 4 Verify | `references/verification.md` | preset resolution, class coverage, computed-value diffing, real DOM |

Examples throughout are taken verbatim from a client design file that uses this
convention (referred to as "the reference design"); the convention is all that
matters, not the file.

## Five hard rules

**1. Never emit `wp:html`.** It renders badly in the editor and hands the client
a block they can't edit. Every element ships as **a real block — core, or one
this theme registers** — or it doesn't ship. A theme-registered block (the icon
block, `references/block-mapping.md` §Icons) satisfies this rule completely: it
is editable, has an inspector, and survives a round trip through the editor,
which is everything `wp:html` fails at. Reaching for a custom block is a `BLK-`
task and a deliberate decision, not an escape hatch — if the answer is "a custom
block would be easier than getting this core block right", it's the wrong answer.

Patterns are PHP files, so PHP may *compute* content — but what it echoes is
always block markup, never bare HTML. (This is a rule about block contexts.
Global UI rendered from `wp_footer` — drawers, modals — is ordinary PHP output
and is not affected.)

**2. When a layer doesn't map cleanly, skip it and flag it.** A layer that is
unnamed, ambiguous, or has no honest core-block equivalent is not an invitation
to improvise a wrapper or a raw-HTML escape hatch. Build everything around it,
leave it out, and record it in the flag ledger — file, pattern, layer name, and
why — so the designer or developer can either rename the layer or decide the
markup. A gap the team knows about is cheap; invented structure is expensive and
invisible.

**3. Measure every node before you style it. Never style from a screenshot.**
Run `get_design_context` on a pattern root before writing one line of that
pattern's CSS, and transcribe what it returns. A screenshot shows you *what a
thing is*; it cannot tell you that the padding is `spacing/6xl` rather than a
number that looks about right, that the alignment is `items-center`, or that the
heading is black rather than the brand navy. Every value you did not measure is
a value you invented, and it will be wrong. `references/css-architecture.md`
§Fidelity has the transcription checklist.

**4. Verify the built page in a browser. Reading your own CSS is not checking.**
Almost nothing in this stack fails loudly — an undefined custom property, a rule
that loses on specificity, a class with no rule at all: the build passes, the
page loads, the result is quietly wrong. Load the site, diff `getComputedStyle`
against the values you measured, and inspect the DOM core actually rendered.
`references/verification.md` is the procedure.

**And your own check is not the last word.** This is a human-in-the-loop system,
with two gates: *gate 1* is you certifying that you re-read the design and
re-diffed the computed values after your last edit; *gate 2* is **a person
reviewing the built output and saying they are satisfied**. A task reaches
`accepted` only at gate 2 — never on your own say-so, never inferred from silence
or from being told to carry on with something else. There is no status called
"done"; `references/project-file.md` §"The two gates" has the protocol.

**5. The build's state lives in `design/PROJECT.md`, not in your context.**
Every task, dependency, acceptance criterion, correction and open question is
written there as it happens. A build of this size outlives any one session, and
a decision that exists only in scrollback will be made again, differently.

## The name grammar

```
pattern[Section - FAQ]/group<section>/[.section]
└─── structural ────┘ └─ hint ─┘└tag┘  └ classes ┘
```

Segments are separated by `/`, and the **last** segment is always the class
payload in square brackets. A name has one, two, or three segments:

| Segments | Shape | Means |
|---|---|---|
| 2 | `hint/[.classes]` | an element inside a pattern or part |
| 3 | `pattern[Name]/hint/[.classes]` | the **root** of a pattern; also names the pattern file |
| 1 | `part[Name]` | a template part; its innards live in the component, not here |
| 1 | `Page--Name` / `Overlay--Name` | a top-level frame (see below) |

### The four structural wrappers

| Wrapper | Example | Becomes |
|---|---|---|
| `Page--<Name>[--<width>]` | `Page--Equipment-Detail`, `Page--Home--768` | a **template** in `wp/templates/`; a numeric suffix makes it a breakpoint variant of the same template, not a second one |
| `Overlay--<type> - <Name>[--state]` | `Overlay--drawer - Rental List--empty` | **not** a template — global UI (drawer/modal) rendered once, plus its state variants |
| `part[<Name>]` | `part[Header]` | `wp/parts/<name>.html` + a `core/template-part` reference |
| `pattern[<Name>]` | `pattern[Section - CTA Two Buttons]` | `wp/patterns/<slug>.php` + a `core/pattern` reference |

A page frame is therefore read as a flat list: `part[Header]`, then N
`pattern[…]` roots in document order, then `part[Footer]`. That list **is** the
template body.

`Page--` names map to the template hierarchy by shape, not by lookup:

- `Page--Home` → `front-page.html`
- plural/list page (`Page--Projects`, `Page--Equipment`) → `archive-<cpt>.html`
- `…-Detail` (`Page--Project-Detail`, `Page--Equipment-Detail`) → `single-<cpt>.html`
- `…-Search` (`Page--Equipment-Search`) → `search.html` or a filtered archive
- anything else (`Page--About`, `Page--Rental-Request`) → an editor page whose
  content is a page pattern, rendered through the generic `page.html`

Confirm the CPT/routing choice with the user before building — the design names
the *screen*, not the WordPress route. It is an open question in PROJECT.md until
answered.

### Breakpoint frames

A **trailing all-digits segment is a screen width**, and that is what
distinguishes it from a state suffix: `Page--Home--768` is the home page at
768px; `Overlay--drawer - Rental List--empty--390` is the empty state at 390px.

These are variants of one thing, never new things. `Page--Home--768` does not
get its own template, and a pattern appearing in three width frames is still one
pattern file and one task — measured at each width, with one set of mobile-first
rules and `min-width` queries between them.

The set of widths across the file **is** the theme's breakpoint ladder; it
replaces the house set. Structure is read from the widest frame (it is the most
complete), CSS is written from the narrowest up. Where a page ships no width
variants, derive per `references/css-architecture.md` §"Deriving, where the
design is silent" and report which rows were derived.

### The element hint

The hint before the classes is the semantic element. Observed vocabulary:

`group` · `aside` · `nav` · `form` · `fieldset` · `label` · `input` · `list` ·
`list-item` · `h1`–`h4` · `paragraph` · `span` · `button` · `icon` · `image` ·
`breadcrumb(s)` · `pagination` · `pagination-previous` · `pagination-next`

Three modifiers ride on it:

- **`<tag>`** — `group<section>`, `group<header>`, `group<article>`. A generic
  group that must render with that HTML tag. Bare `group` = `div`.
- **`>link`** — `nav>link`, `paragraph>link`, `span>link`. The node *is* an
  anchor inside that element. `paragraph>link/[.body.fw-regular]` is a `<p>`
  whose content is a link, not a `<p>` next to one.
- **`::pseudo`** — `[.item__text::before]`, hint omitted entirely. **Emits no
  markup.** It is a CSS pseudo-element the designer drew as a real layer so it
  could be positioned. Style it; never output a block for it.

### The class payload

`[.card.card--equipment-landscape]` is plain BEM plus a utility layer:

| Kind | Example | Note |
|---|---|---|
| block | `.card`, `.section`, `.btn`, `.input` | the component |
| modifier | `.card--project`, `.btn--large`, `.section--hero--left` | double-dash; can stack, and can chain twice |
| element | `.card__title`, `.section__header`, `.faq__item__header` | double-underscore |
| state | `.disabled`, `.faq__item--expanded` | render the default state; the variant is CSS/JS |
| typography utility | `.body`, `.text.text--small`, `.fw-semi-bold`, `.uppercase` | **names a Figma text style** — see below |

The typography utilities are not decoration. Each one owns a single slice of a
design-system text style — role, size, weight, case — and the payload composes
them: `.text.text--small.fw-regular` reconstitutes
`Static Pages/Text Small/Regular`. That is how type gets into the theme without
measuring pixels. Write them as separate CSS rules, never one rule per Figma
style; `references/design-tokens.md` has the decomposition.

Names that don't obey this grammar are the normal case, not the exception:
`references/name-grammar.md` has the recover-or-skip tables and the flag report
format.

## Annotations are the second channel

The layer names carry structure and `get_design_context` carries values. Neither
can carry **intent** — and a large share of what makes a build correct is intent:

- which post type a card is, and what filters its loop applies
- which WordPress route a `Page--` frame actually becomes
- how a thing behaves when touched — a toggle, a drawer, a validation
- what a screen reader should announce where the visual gives no clue
- whether copy is final, placeholder, or coming from the client
- that this hero is *not* a photo hero, whatever it looks like

Figma annotations are where the designer says these things, and the skill treats
them as **authoritative over inference**. Where an annotation and your reading of
the geometry disagree, the annotation wins; where an annotation exists, you do not
guess and you do not ask a question it already answers.

The tags read during extraction — `@cpt`, `@query`, `@route`, `@interaction`,
`@a11y`, `@content`, `@block` — are listed with their meanings in
`references/figma-extraction.md` §7, and land in `design/annotations.json`.

**If the file carries none, ask for them, specifically.** Not "please add
annotations", but: an `@query` on every loop, an `@route` on every ambiguous
`Page--`, an `@interaction` on anything that moves. It is minutes of the
designer's time against a whole class of decisions you would otherwise make by
guessing, and it is the single cheapest fidelity win in the process.

## The phases

### Phase 0 — scaffold, or complete what exists

Before any Figma call. Detect the repo shape (Pentadeep theme repo vs standalone
vs a WordPress install you should not be inside), then check the theme has what the
later phases assume: the `src/` / `wp/` split, `design/`, the boot files, a
settled prefix, a local WordPress instance linked in and loadable in a browser.

If the project exists, **complete it — don't re-scaffold**. Report what was
missing. `references/scaffolding.md` has the detection table, the file list, and
the scaffolding commands (`wp-build new-theme <slug>`, `pnpm link-site`),
including the constraint that bites: `new-theme-file.ps1` is interactive and
cannot be driven from a shell.

**This phase is in flux** — the scaffolding is being reworked to remove that
friction so Phase 0 can run end to end unattended. Until then the manual paths in
`scaffolding.md` apply; re-read it rather than working from memory of how
scaffolding went last time.

### Phase 1 — extract the design, to disk

Ask for the Figma file if you weren't given one; nothing proceeds without it.
Then read it **completely, once, writing every response to `design/`**: a file
map of pages and top-level frames, a per-frame node tree for each, the full
variable and style inventory, every component set with its variant axes and
properties, the instance→component map, prototype reactions and motion, and every
annotation.

Never hold a dump in context — grep it. A page canvas is ~160KB, and a model that
has overflowed is a model that starts inferring structure from the render, which
is hard rule 3 failing through the back door.

Two reads, two times, for a reason: **Phase 1 takes identity** (`get_metadata` —
ids, names, types, sizes, positions), **Phase 3 takes values** (`get_design_context`,
per task, just before styling). Values drift and identity doesn't; a measurement
taken now and used three sessions later measures a design that no longer exists.

Report the inventory — counts, ramps, component axes, anything unresolved —
before building from it. `references/figma-extraction.md` has the order of work
and the coverage checklist.

### Phase 2 — write PROJECT.md

Turn the inventory into a task list at `design/PROJECT.md`: one buildable unit
per task, typed stable IDs, real dependencies, and acceptance criteria a stranger
could check. Collect the distinct `pattern[…]` and `part[…]` names across **all**
pages first — they repeat (`pattern[Client Logos]` appears on three), and one
name is one file, built once.

Agree the list with the user before building from it.
`references/project-file.md` has the schema, the dependency table, the flag
ledger, and how to resume a session against it.

### Phase 3 — build, task by task

In dependency order:

1. `theme.json` presets, base classes, and utility classes from the Phase 1
   inventory (`references/design-tokens.md`).
2. `BLK-` blocks the theme registers, and `CPT-` post types and their ACF
   fields — both before anything that consumes them. A pattern can ship a loop
   as a stub against an unregistered CPT, but it cannot use an icon block that
   doesn't exist.
3. `wp/parts/` — header, footer.
4. Then, **pattern by pattern**: `get_design_context` on the root → its markup
   in `wp/patterns/` → its CSS, transcribed from that same response → build,
   load, diff, fix. Measure, style and verify one pattern at a time; do not build
   all the markup first and style it later from memory.
5. `wp/templates/` — thin: a part, a list of `core/pattern` refs, a part.
6. Overlays last — they need JS and a render hook, not a template.

Re-read a node with `get_design_context` before you finalise it. Designers keep
working; two reads of the same node minutes apart can differ, and the later one
wins.

Motion belongs to the pattern that carries it: hand the extracted reactions and
timings to the `web-animation-design` skill rather than inventing easing here.

### Phase 4 — verify, inside Phase 3's loop

Not a stage at the end. The loop is:

```
measure → markup → CSS → build → load → diff → fix → re-diff → tick → next task
```

Every defect in the reference build was found by a later pass looking again at
something an earlier pass had called done. Batching the verification is what
makes that late pass necessary. `references/verification.md` has the five checks;
a PROJECT.md checkbox is ticked only after its check has actually run.

Then the two gates, in order:

- **Gate 1 — you certify.** Every box ticked, the node re-read and the values
  re-diffed *after* your last edit, and you say so plainly: "checked and
  re-checked against the design; checks 1-5 pass." Status → `verified`.
- **Gate 2 — a person approves.** Hand over the URL, what to look at, and what
  you know is imperfect. Then stop. Only the reviewer moves a task to
  `accepted`, and one task at a time — batching a page's worth of work into one
  review request is where things get waved through.

## Spot the query loops

**Check the annotations first.** A `@query` annotation on the wrapper states the
post type and the filters outright — `post_type=equipment,
tax=equipment_category:excavators, per_page=6` — and where one exists it settles
the question completely, including whether this is a loop at all. Build exactly
that. The heuristics below are for what the designer didn't annotate, and the
post type you infer from them is an open question in PROJECT.md, not a decision.

Two different repeats, two different answers:

- **Repeated sibling instances of one card inside a body wrapper** — four
  `group<article>/[.card.card--project]` inside `group/[.section__body-row]` —
  is a **`core/query` + `core/post-template`**. The card's inner names are the
  post-template markup; the repetition is data, not design.
- **A repeated `pattern[…]` root within one page** — `Page--Projects` carries
  five `pattern[Section - Left Article List]` — is **five real sections**
  (usually one per category/term), not a loop over one. Each gets its own
  `core/pattern` reference, or one pattern parameterised by term.

If a card subtree is a query loop, its `.card__title` becomes `core/post-title`,
`.card__image` becomes `core/post-featured-image`, and so on — not a hand-written
heading. The component set's TEXT properties are the field list; you do not have
to invent it.

**Post types are registered through ACF**, as `CPT-` tasks, and custom fields
reach the markup through `metadata.bindings` rather than PHP echoing values.
Where the CPT doesn't exist yet, **ship the loop as a stub** — the real query and
post-template structure, the intended `postType` set, bindings written against
the agreed field names — so the section renders empty rather than wrong and
becomes correct the moment the CPT is registered, with no markup change.
`references/block-mapping.md` §"Loop context" has the swaps, the ACF detail and
the stub shape.

## The CSS side

The class payloads are the theme's **own** stylesheet in `src/css/` — they are
not core-block classes and WordPress will not style them. `theme.json` supplies
tokens (colour, spacing, type); the BEM components supply layout and look.

**Specificity gotcha:** a theme shipping `disable-layout-styles` /
`appearanceTools:false` makes WordPress print its resets as `:root :where(…)` at
(0,1,0) *after* the theme stylesheet. A single-class rule like `.card__image`
ties and loses on source order. Nesting the element inside its block solves this
by construction — see `references/css-architecture.md`. Verify in the browser,
not in the source sheet.

## Comments carry direction, not derivation

The reasoning behind a decision already has a home: `design/PROJECT.md` for what
was decided and why, `design/measurements/` for what was measured. A comment that
repeats either is a second copy of the same fact, and the inline one is the copy
nobody updates.

A comment earns its place only where the code cannot say the thing itself:

- a constraint that is invisible locally — *core kebab-cases `2xl` to `2-xl`*
- a deliberate deviation from a rule — *px here, mirroring core's own admin-bar
  breakpoint*
- a trap the next edit would fall into — *must stay nested; lifted out it loses
  on specificity*

Everything else goes. Don't narrate what the declarations do, don't restate the
measurement a value came from, and don't record what the code used to be — that
is what git is for.

**A block comment longer than the rule it introduces is the signal.** When the
reasoning genuinely needs that much room, it belongs in PROJECT.md, and the
comment becomes a pointer to it:

```css
/* Hidden below md; the 768 frame draws both with labels, 320 draws neither.
   Must stay nested — at .header level this loses to `& .btn--nav` on
   specificity and silently does nothing. See FLAG-13. */
```

## Before you call it done

- **Every pattern was measured with `get_design_context` before its CSS was
  written**, and re-read before being called done.
- Comments carry direction, not derivation — no block comment longer than the
  rule it introduces, and no rationale duplicated from PROJECT.md.
- Component sets were resolved, and no distinction a variant axis already makes
  was reconstructed with a `:has()` guess.
- Icons and images were exported with `download_assets` (the `svgAssets` entry,
  not `export`) — no `core/image` ships without a source, because an empty one
  does not render at all.
- Every class in the markup has at least one CSS rule — no named element is
  left unstyled — and every stylesheet in `src/css/` is imported in `main.css`.
- No fill, colour, size or spacing step appears that the design did not state;
  no stated one is missing.
- **No `wp:html` anywhere in the output.**
- **No raw pixel value in any stylesheet or `theme.json` preset** — sizes in
  `rem`, media queries in `em`, `font-size: 1rem` on `:root`. Font sizes are
  `rem` everywhere; a percentage in a font-size means something was missed.
- Fonts are self-hosted `woff2`, declared in `theme.json` `fontFace`, and every
  `src` path resolves to a file that exists.
- Every `--wp--preset--*` / `--wp--custom--*` the CSS references resolves to a
  real `theme.json` preset **after** core's slug kebab-casing — an undefined
  custom property drops its whole declaration and reports nothing.
- **The page was loaded in a browser and its computed values diffed against the
  measurements**, per pattern, with every mismatch fixed and re-checked.
- No rule of yours setting padding, margin or gap on a block element sits at
  (0,1,0), where the global-styles resets tie and win.
- Anything still wrong that is site configuration rather than theme code — no
  menu assigned, no logo, no images — is reported as such, not worked around.
- Every distinct `pattern[…]` name has exactly one file; no pattern is inlined
  into a template.
- Every `part[…]` is a real template part with an `area`, not a group.
- No block was emitted for a `::pseudo` layer.
- Every `group<tag>` renders with that tag (check the `tagName` attribute).
- Class payloads survive into the markup verbatim (`className`), including
  modifiers — they are the CSS contract.
- Repeated cards render through a query loop, not N copies.
- `utilities/` is imported last and `:root`-prefixed; no nested component rule
  declares a property a utility owns.
- Every hover effect is gated behind `(hover: hover) and (pointer: fine)`, every
  control has a ≥44px target and a `:focus-visible` state, and inputs are ≥16px.
- **The pattern was tabbed through**: focus order matches reading order, focus is
  always visible, no positive `tabindex`, nothing focusable inside a closed
  overlay.
- **Every element carries the semantics the design couldn't state** — landmark
  tags, `aria-label` on unlabelled icon controls, `aria-hidden` on decorative
  icons, real `alt` or a deliberate empty one, `aria-expanded`/`aria-controls` on
  disclosures, `role="dialog"` with a focus trap on overlays
  (`references/accessibility.md`). Where an `@a11y` annotation exists, it wins.
- The breakpoint ladder came from the design's own frame widths where they
  exist, and every pattern was measured and diffed at each width it was drawn
  at — not only the widest.
- The ladder was shown to the user marking each cell measured or derived, not
  buried in a commit; the derived cells are the ones the designer has not seen.
- Icons ship through the theme's icon block where it exists, and the fallback is
  recorded as a `BLK-` task rather than left to harden.
- Query loops built without a `@query` annotation have their inferred post type
  recorded as an open question, not buried in the markup.
- **PROJECT.md is current** — every task's status reflects a check that actually
  ran, and the flag ledger carries every correction, skip and open question.
- **Nothing is `accepted` that a person hasn't reviewed.** Gate 1 is yours to
  claim; gate 2 is not.
