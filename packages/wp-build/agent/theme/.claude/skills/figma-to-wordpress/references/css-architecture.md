# CSS architecture

How the stylesheet is organised, nested, and made responsive.
`design-tokens.md` defines what goes in the token and utility layers;
`block-mapping.md` defines the markup those classes land on.

## Layers

`main.css` is a manifest of `@import`s and nothing else. **Import order is
cascade order** — that is the whole reason for the layering, so keep the file
ordered and commented.

```
src/css/
  main.css        manifest only
  abstracts/      custom properties. Emits no selectors but :root
  base/           reset, element defaults, the prose ramp
  layout/         the chassis: container widths, grid, .section skeleton
  components/     BEM blocks — one file per block (.card, .btn, .drawer)
  patterns/       per-pattern section modifiers — one file per wp/patterns/*.php
  utilities/      single-property composables — imported LAST
```

Ordered by increasing specificity and decreasing reusability. `abstracts/`,
`base/`, `layout/` and `components/` match the existing `pentadeeptwo` structure;
`patterns/` and `utilities/` are the two this convention adds.

- **`patterns/`** pairs 1:1 with the shipping patterns — `wp/patterns/section-faq.php`
  ↔ `src/css/patterns/_section-faq.css`. It holds `.section--faq` and its
  descendants, nothing reusable. If a rule here would serve a second pattern, it
  belongs in `components/`.
- **No `templates/` layer.** A rule that can only be expressed per-template is
  almost always a missing modifier class. If you truly need one, put it in the
  pattern file that only that template uses.

### Making utilities win, deterministically

Nesting (below) raises component rules to (0,2,0), so a flat utility at (0,1,0)
loses to them no matter what order they import in. Three rules make the outcome
arithmetic rather than a matter of care — no doubled classes, no `!important`:

1. **A component must not declare a property a utility owns.** If the payload
   carries `.fw-medium`, `.card__title` has no business setting `font-weight`.
   This is the decomposition principle from `design-tokens.md` applied to
   component CSS, and it removes most collisions before they exist.
2. **Where a component legitimately must set one — a default the payload doesn't
   always override — it does so only in the block's own top-level rule**, never
   in a nested element rule. That caps those declarations at (0,1,0).
3. **Utilities carry a `:root` prefix**, putting them at (0,2,0):

```css
:root .fw-bold   { font-weight: 700; }
:root .ls-tight  { letter-spacing: var(--<prefix>-ls-tight); }
:root .uppercase { text-transform: uppercase; }
```

(0,2,0) beats the (0,1,0) ceiling rule 2 imposes, so the utility always wins —
and it wins on specificity, not on import order, so it survives a file being
moved. The prefix is uniform across the layer, which makes it read as the
convention it is rather than a patch on one rule. It is also the same idiom
WordPress uses on its own global styles (`:root :where(…)`).

Rule 2 is the one to enforce in review: a nested element rule setting
`font-weight`, `letter-spacing`, `text-transform` or `font-size` is the bug.

### Know exactly what WordPress resets, and clear it

Global styles print a fixed set of `:root :where(…)` rules — **(0,1,0), and
after your stylesheet**. These are the ones that bite:

| Reset | Properties |
|---|---|
| `:root :where(.wp-block-group)` | `margin`, **`padding`** |
| `:root :where(.is-layout-flex)` | `row-gap`, `column-gap` |
| `:root :where(.is-layout-flow) > *` | `margin-block-start/end` |
| `:root :where(p)`, `:root :where(.wp-block-list)` | `font-size`, `line-height`, `margin` |
| `:root :where(.wp-element-button, .wp-block-button__link)` | `background-color`, `border-*`, `padding` |

Every group block you emit carries `.wp-block-group`; every `core/buttons`
carries `.is-layout-flex`. So **any rule of yours that sets padding, margin or
gap on a block element must reach (0,2,0)** — at (0,1,0) it ties and loses on
source order, and the declaration vanishes with no warning.

Nesting gets you there for elements (`.card .card__body`). For a **block and its
own modifier**, compound the two classes the payload already carries:

```css
.card.card--simple { padding: var(--<prefix>-space-xl); }   /* (0,2,0) — wins */
.card--simple      { padding: var(--<prefix>-space-xl); }   /* (0,1,0) — silently lost */
```

That is not the class-doubling this file rejects elsewhere: both classes are
genuinely in the markup, and compounding them states the real target.

**A related trap on the utility side.** A utility that sets a property the
design varies per context will beat every component, because utilities are
`:root`-prefixed (0,2,0) and load last. A `gap` on `.vflex` / `.hflex` is the
classic: it silently overrode a 21px footer stack, a 12px button group and a
32px hero stack with one blanket value. Layout utilities own **direction and
alignment**; spacing that changes per usage belongs to the component or to an
explicit `.gap-*` class.

### WordPress also adds chrome: the admin bar

For a logged-in user, core adds `.admin-bar` to `<body>` and prints a **fixed**
`#wpadminbar`. Anything the theme sticks or fixes to the top of the viewport
slides underneath it — a sticky header is the usual casualty, and the bug is
invisible to logged-out visitors and to anyone testing only the top of the page.

**Do not hard-code the height.** Core publishes it, and maintaining your own copy
of 32/46 and the 782px breakpoint is a needless liability:

| Variable | Defined on | Value |
|---|---|---|
| `--wp-admin--admin-bar--height` | `html` | 32px, 46px at ≤782px |
| `--wp-admin--admin-bar--position-offset` | `html :where(.is-position-sticky)` | the height, and **0 at ≤600px** |

The height variable ships in `admin-bar.css`, which WordPress enqueues **only
when the bar is shown** — so a `0px` fallback covers logged-out visitors and you
never need to scope on `.admin-bar`:

```css
:root  { --<prefix>-admin-bar-offset: var(--wp-admin--admin-bar--height, 0px); }
.header { position: sticky; top: var(--<prefix>-admin-bar-offset); }
```

The one thing the height variable does not encode: **below 600px the bar becomes
`position: absolute` and scrolls away**, so the offset must drop to zero. Core
signals this on `--wp-admin--admin-bar--position-offset`, but only defines that
under `html :where(.is-position-sticky)` — a class the *editor* generates for
blocks given sticky positioning, which a hand-written template part does not
carry. Either add that class to the element, or mirror the one rule:

```css
@media screen and (max-width: 600px) { :root { --<prefix>-admin-bar-offset: 0px; } }
```

**That media query is the one sanctioned exception to the relative-units rule.**
It mirrors core's own px breakpoint; in `em` it would drift out of step with the
real admin bar the moment a reader scales their text, putting the header wrong
for exactly the people who need it right. Any other px in the stylesheet is still
a bug — after this, the reference build's entire compiled CSS contains one.

The wider lesson: **before inventing a value that mirrors WordPress UI, check
whether core already publishes it as a custom property.** Copied constants go
stale silently when core changes them.

### Verify in the browser, not in the source sheet

None of the above produces an error. Load the page and check computed values
against the design — a short script comparing `getComputedStyle` to the measured
values catches in seconds what reading CSS cannot. The rendered DOM is also
routinely deeper than the block implies: `core/navigation` puts **four wrapper
divs and a second `<ul>`** between `<nav>` and `<li>`, all auto-height, which
breaks any percentage-height chain. Inspect the real markup before writing
selectors against a core block.

### Do not reach for `@layer`

Cascade layers look like the obvious tool here and are the wrong one **in a
WordPress theme**. Unlayered styles beat layered ones for normal declarations,
and WordPress prints its global-styles resets unlayered. Wrap the theme's
stylesheet in `@layer` and every one of those resets starts winning against
every rule you wrote — including the margin and padding fixes that nesting
currently earns by specificity. The three rules above do the same job without
handing the cascade to `wp_enqueue_global_styles`.

> The decomposed-utility model is a change from `pentadeeptwo`, where the type
> classes are bundled (`.heading--l` sets family, size, weight, line-height and
> colour together) and live in `base/`. Bundled classes have no overlap problem
> because nothing composes onto them. Decomposed utilities do, which is why they
> move to the end of the cascade and take the `:root` prefix.

## Nesting

Use native CSS nesting to buy specificity structurally, instead of retyping the
parent selector on every element rule.

```css
.card {
  display: flex;
  gap: var(--<prefix>-space-lg);

  & .card__title { … }        /* → .card .card__title    (0,2,0) */
  &.card--project { … }       /* → .card.card--project   (0,2,0) */
  & .card__image img { … }

  @media (min-width: 1024px) { … }
}
```

Nesting an element inside its block produces `.card .card__title` — (0,2,0),
which clears WordPress's `:root :where(…)` resets at (0,1,0) **by construction**.
That is the point: the specificity problem is solved by where you write the rule,
not by remembering to prefix it.

Four rules:

- **`&` is a selector reference, not string interpolation.** `&--project` is
  **invalid** in native CSS — that is Sass. Write `&.card--project`.
- **Cap at three levels** — block → element → child/state. Deeper nesting mirrors
  the DOM, couples the CSS to markup that will change, and produces selectors
  nobody can override.
- **Nest the media query inside the rule**, next to the declaration it changes,
  rather than collecting rules under a breakpoint.
- **Never nest utilities.** They are flat, single-property, and end-of-cascade by
  design.

## Fidelity: transcribe, don't approximate

The output is meant to be a 1:1 replica. Every value comes from
`get_design_context` on that node (hard rule 3), and the response is a
specification, not a suggestion. Work down this table for **every node** in the
pattern — the root, every wrapper, every leaf.

The characteristic failure is stopping two levels in: transcribing the section
root and its content wrapper, then inferring the rest because it "looks like the
other cards". The response gives you every descendant, so read every descendant.
The alignment of a card body, the gap of a nested stack, and the width of a
paragraph are all in there, and all three were wrong in the reference build
because a pass stopped at level two.

| The response says | You write | Miss it and |
|---|---|---|
| `flex`, `flex-col`, `grid`, `flex-wrap` | `display`, `flex-direction`, `flex-wrap` | the axis is wrong |
| `gap-[var(--spacing/4xl,64px)]` | `gap: var(--<prefix>-space-4xl)` — **the named step**, not a similar one | rhythm drifts everywhere |
| `py-[…]`, `px-[…]`, `p-[…]` | padding **on that exact node** | you pad the parent and the borders land wrong |
| `items-center`, `justify-center`, `self-*` | `align-items`, `justify-content`, `align-self` | content sits left when it should be centred |
| `text-center` | `text-align` | same, silently |
| `w-[1200px]`, `min-w-[200px]`, `max-w-[…]`, `h-[…]`, `size-full` | the matching width/height/min/max, in `rem` | buttons collapse to their label, prose runs full width |
| `whitespace-nowrap`, `[word-break:break-word]` | `white-space`, `overflow-wrap` | headings wrap where the design doesn't |
| `bg-[var(--color/…)]` | `background-color` — **only where stated** | invented surfaces |
| `border-l border-r border-[…]` | the exact sides and colour | the design's rule motif goes missing or doubles |
| `rounded-[…]` | `border-radius` | corners wrong |
| `leading-[1.1]` | `line-height` | vertical rhythm off by a line |
| `tracking-[-0.72px]` | a `.ls-*` utility — **converted to `em`**: −0.72 ÷ 24px = `-0.03em` | tracking is size-locked and breaks when the type scales |
| `text-[color:…]`, `text-black` | `color` | brand colour applied where the design uses black |
| `font-[family-name:…]`, `text-[length:…]`, `font-[…]` | the role + size + weight utilities | type ramp ignored |
| `shrink-0`, `grow`, `absolute`/`relative`, `inset-*`, `opacity`, shadows | as stated | layout collapses under content |

### Where a faithful reading still produces wrong CSS

Transcribing the value correctly is not always enough — Figma and CSS disagree
about what some properties *do*. Each of these shipped as a bug before it was
caught in the browser.

**A Figma stroke costs no layout width; a CSS border does.** A 1200 frame with a
left stroke still lays out 1200 of children. The same thing as
`border-inline-start` gives a 1199 content box, and four 300px cards no longer
fit — the last one wraps. Wherever a container's width is divided by
fixed-width children, draw its rules with an **inset box-shadow** instead:

```css
box-shadow: inset var(--<prefix>-hairline) 0 0 0 var(--<prefix>-color-border);
```

**Percentage heights die on any auto-height ancestor.** `height: 100%` resolves
against the containing block, so a single `height: auto` wrapper between you and
the definite height silently collapses the whole chain to content height. Core
blocks are full of such wrappers. Prefer a **stretch chain** — `display: flex` +
`align-items: stretch` at every level — which needs no definite height anywhere.

**`flex: 1 1 0` collapses when a row stacks.** It is correct in a row and
catastrophic in a column: a zero basis inside a height-less column resolves to
zero height. Scope every flex-grow rule to the state where the container is
actually a row, and give the stacked state its own sizing.

**For a wrapping row, put the design width in `min-width`, not `flex-basis`.**
`flex: 1 1 0` with `min-width: <card width>` distributes the row and breaks only
when a card would go under its design width. A basis equal to that width leaves
no slack for the sub-pixel rounding a 1200/4 split produces, and wraps early.

**A shrink-wrapped child in a centred container is centred.** Figma puts `w-full`
on nearly every text node; drop it and the paragraph shrink-wraps, at which
point a parent's `align-items: center` becomes visible as centred text. The
width is what makes the centring a no-op. Transcribe it.

### Never invent

Each of these is a real failure, not a hypothetical:

- **A fill the node doesn't have.** No `bg-` in the response means no
  `background-color` in the CSS.
- **A semantic alias that contradicts a stated colour.** A `--<prefix>-color-heading`
  set to the brand navy will quietly override a design that says `text-black` on
  every heading. Semantic roles are only safe where the design *has* a semantic
  layer; where it doesn't, take the stated colour.
- **A fluid `clamp()` in place of a stated fixed size.** Fluid sizing is derived
  *from* the measured value — the stated size is the clamp's **max**, never
  something to replace.
- **Padding on a different element than the one carrying it.** `py` on
  `.section__content` is not `padding-block` on `.section`; the container's
  borders are drawn relative to it.
- **A neighbouring token step.** `spacing/4xl` is 64. Not `2xl`, not "about 48".

### Coverage check, per pattern

Before the pattern is done:

1. **Every class in the emitted markup has at least one rule.** A named element
   with no CSS is a bug, not a default — `.content__text-stack` rendering
   unstyled is how a centred block ends up left-aligned.
2. **Every property in the table above is either written or deliberately
   overridden**, and an override carries a comment saying why.
3. **Diff the rendered result against the node screenshot** at the same width
   before calling it done.

## Units: relative only

**No raw pixel value ships.** Figma reports everything in px; px is the unit of
the design file, not of the stylesheet. Convert once, at the token boundary, and
never again below it.

| For | Use | Not |
|---|---|---|
| Root size | `font-size: 1rem` on `:root` | `16px` — it overrides the reader's browser setting; `100%` works identically but splits the vocabulary |
| Font size, spacing, width, height, radius | `rem` | `px` |
| Media query conditions | `em` | `px` — some browsers ignore px MQs when the user scales text |
| Something sized against its own text | `em` | `rem` |
| Line height | unitless | `px`, `rem` |
| Fluid ranges | `clamp()` with `rem` bounds and a `vw` slope | px bounds |
| Fills, tracks, ratios | `%`, `fr`, `aspect-ratio` | fixed dimensions |

Conversion is `px ÷ 16`, and it happens **only** in the token files —
`spacing/lg` 24 becomes `1.5rem` once, and every component then writes
`var(--<prefix>-space-lg)`. A raw `rem` literal in a component file is nearly as
wrong as a raw `px`: it means a token is missing.

The point is not tidiness. With `font-size: 1rem` at the root, a reader who sets
their browser to 20px gets a proportionally larger *layout*, not just larger text
inside a box that stays 300px wide and overflows.

`1rem` on `:root` resolves against the browser's own default, so it preserves the
reader's setting exactly as the older `font-size: 100%` idiom did. The reason to
prefer it is that the stylesheet then states every size in one unit: a percentage
appearing anywhere in a font-size is a signal that something was missed, rather
than a special case you have to remember is deliberate.

There is exactly one sanctioned exception: the **≤600px admin-bar media query**,
which mirrors a px breakpoint of core's own. See §"WordPress also adds chrome".
Any other pixel is a bug.

**Hairlines are the one place to think twice.** A 1px rule scaled to `0.0625rem`
grows with the root size, which is usually right in a fully relative design but
occasionally reads heavy. Give it a token either way — `--<prefix>-hairline` —
so the decision is in one place rather than sprinkled through fifty borders.

## Mobile-first and fluid

Every rule is written for the smallest viewport first; every breakpoint is
`min-width`, expressed in `em`. The house breakpoint set:

| | xs | s | m | l | xl |
|---|---|---|---|---|---|
| Viewport (px) | 300 | 600 | 1024 | 1440 | 1920 |
| Media query | 18.75em | 37.5em | 64em | 90em | 120em |

**This set is the fallback.** Where the design ships breakpoint frames, their
widths are the ladder and this table is not used — see §"Designed breakpoints".

### Fluid width

Widths are **tokens that change per breakpoint**, not `padding-inline` on
wrappers. Between adjacent breakpoints the token interpolates with a piecewise
`clamp()`, so width flows smoothly and never steps:

```
clamp(MIN, calc(INTERCEPT + SLOPE × 100vw), MAX)
  SLOPE     = (MAX − MIN) / (viewport_max − viewport_min)
  INTERCEPT = MIN − SLOPE × viewport_min
```

Redefine the token in `:root` under each breakpoint, as `pentadeeptwo`'s
`abstracts/_layout.css` does. One token, five definitions, no wrapper padding.

### Fluid type

Only the large roles go fluid — `.display` and `.heading`. `.text--*` and `.body`
sit between 10px and 16px, where fluid sizing buys nothing and shrinking is
actively harmful (`.text--xsmall` at 10px is already at the floor; never let it
compute smaller).

Take the **max from the Figma value** and the **min from a step down the same
token ladder** — never an invented number. For `.display`, 40 (`5xl`) → 24
(`3xl`) across 300→1920:

```css
.display { font-size: clamp(1.5rem, 1.315rem + 0.988vw, 2.5rem); } /* 24 → 40 */
```

### Touch

Mobile-first is not only about width. The small viewport is also the touch
viewport, and a desktop design says nothing about either. Assume touch by
default and treat hover as the enhancement.

**Hit targets.** A control must be at least 24×24 CSS px to meet WCAG 2.2 AA
(SC 2.5.8); 44×44 is the platform guidance and what to actually design to. Icon
buttons in a desktop design are routinely smaller — in the reference design,
`.btn--icon.btn--decrement` / `--increment`, `.card__remove-btn`,
`.pagination__btn`, `.faq__toggle` and `.checkbox` are all candidates. Extend
the target without touching the visual size:

```css
:root .btn--icon {
  position: relative;

  &::after {                       /* invisible hit area, centred on the button */
    content: '';
    position: absolute;
    inset: 50%;
    min-width: 44px;
    min-height: 44px;
    translate: -50% -50%;
  }
}
```

Enlarging the drawn button instead would break the design; enlarging the target
is invisible and correct. Watch for adjacent controls whose extended targets
would overlap — the increment/decrement pair is the obvious one — and space them
so they don't.

**Hover is an enhancement, never a carrier.** Nothing essential may live behind
`:hover` — no tooltip-only labels, no reveal-on-hover actions, no hover-only
menus. Gate every hover effect, as `pentadeeptwo` already does:

```css
@media (hover: hover) and (pointer: fine) { … }
```

Ungated, a tapped element keeps its hover state on touch until something else is
tapped — the "sticky hover" bug.

**Give touch its own feedback.** With no hover, the only affordances are
`:active` and `:focus-visible`. Every interactive component needs both, and
`:focus-visible` must be visible against the surface it sits on, not just the
page background.

**Inputs: 16px minimum, or iOS zooms.** Safari zooms the viewport when a focused
input's font-size is under 16px, and does not zoom back out. The `lg` token is
16 — `.input` and its variants use that, never `.text--small` at 12. This is a
real risk in the reference design, whose form fields sit in a design where 12px is the common UI
size.

**Scroll regions need an affordance.** Anything that becomes horizontally
scrollable on narrow screens (`.product__thumbnails`, galleries, spec tables)
needs `scroll-snap-type` and a visible hint that there is more — a peeking next
item beats a scrollbar nobody sees.

**Size by pointer, not only by width.** A touch device can be wide (tablets,
touch laptops). Where a control's size should follow input type rather than
viewport, key it to `@media (pointer: coarse)` instead of a breakpoint.

Markup carries part of this too: `inputmode` and `autocomplete` on the phone,
date and number fields decide which keyboard a phone opens. See
`block-mapping.md` §Forms.

## Responsive behaviour

Two paths, and which one you are on is decided by the design, not by preference.

**Where the design ships breakpoint frames, read them.** A top-level frame whose
name ends in a numeric segment — `Page--Home--768` — is that page drawn at that
screen width. Those frames are the spec, and the derivation below does not apply
to anything they cover.

**Where it doesn't, derive** — the layer-name convention makes that mechanical
rather than inventive: the same structural class always collapses the same way,
so the behaviour comes from the name, not from a judgement per section.

Most files are a mix: a full desktop set, one or two narrow variants of the
pages that needed them, and nothing for the rest. Read what exists, derive the
gaps, and be explicit in the report about which rows are which — a derived row is
one the designer has not seen.

## Designed breakpoints

### The frame widths are the ladder

Collect every distinct numeric suffix across the file. That set replaces the
house ladder above; do not average it against the house set, and do not add a
breakpoint the design doesn't have because the house set has one.

Each width becomes a **`min-width`** query in `em` (px ÷ 16), because a frame
drawn at 768 describes the layout from 768 up to the next designed width:

| Frame suffix | Media query |
|---|---|
| `--390` | base — no query; this is what mobile-first means |
| `--768` | `@media (min-width: 48em)` |
| `--1024` | `@media (min-width: 64em)` |
| `--1440` | `@media (min-width: 90em)` |

**The narrowest frame is the base**, written with no media query at all. If the
narrowest frame in the file is 768, nothing describes 320-767 and that is a gap
to raise, not to fill silently — the design has no opinion below its own floor.

### Read in two directions

The two reads run opposite ways, and mixing them up is how a build goes wrong:

- **Structure comes from the widest frame.** It is the most complete: narrow
  frames drop elements, collapse two columns into one, and swap a nav for a
  toggle. Build the markup from the widest so nothing is missing, then let CSS
  hide or reorder.
- **CSS is written from the narrowest up.** Mobile-first, `min-width` only. The
  base rules are the narrow frame's values; each query adds what the next width
  changes.

One consequence worth stating: if a narrow frame contains an element the wide one
doesn't, that is not a CSS problem. Either the markup needs it (and it is hidden
above the breakpoint) or the two frames disagree — which is a question for the
designer, in the flag ledger.

### Measure every frame, not just the widest

A pattern's task is not measured until `get_design_context` has run on **its root
in every frame that carries it**. Transcribe each width into the same
`design/measurements/<task>.md`, one section per width, because the diff in
`verification.md` runs at each of them.

Values that look derivable are routinely not: a designer who redraws a section at
768 often changes padding, type size and gap together, and none of those follow
from the desktop values by rule.

### When only some widths exist

Common, and fine. For a page with frames at 1440 and 390 but nothing between,
build those two from measurement and derive the middle per the fallback below.
Report the ladder as a table marking each cell **measured** or **derived**, so
the designer can see exactly what was invented on their behalf.

## Deriving, where the design is silent

### The default collapses

| Layer name | Desktop | Below `m` (1024) |
|---|---|---|
| `[.section__content--horizontal]` | row | column |
| `[.section__content--vertical]` | column | unchanged |
| `[.section__body-row]` / `[.section__body-grid]` | N across | `repeat(auto-fit, minmax(<card-min>, 1fr))` — **no breakpoint at all** |
| `[.hflex]` | row | `flex-wrap: wrap` |
| `[.vflex]` | column | unchanged |
| `aside/[.filter-sidebar]` + main | two columns | sidebar becomes a `<details>` disclosure above the content |
| `[.product__thumbnails]`, galleries | row | horizontal scroll + scroll-snap |
| `[.pagination]` | full number list | prev / current / next |
| `image/[…]` | fixed W×H | `width: 100%` + `aspect-ratio` taken from the Figma frame |
| `.section` side space | grid offset | the fluid width token |

Card rows are the important row in that table: `auto-fit` + `minmax()` makes them
intrinsically responsive, so a four-across row reflows to three, two, and one
with no media query written. Reach for a breakpoint only when intrinsic sizing
genuinely can't express the change.

### Deriving the breakpoint table

Read the design's grid style for the desktop row — the reference design's `12-col-grid` is 12
columns, 24px gutter, 120px offset at 1920, so content is 1680. Then scale
columns down the standard ladder (12 → 12 → 8 → 4 → 4) and margins with them:

| | xs 300 | s 600 | m 1024 | l 1440 | xl 1920 |
|---|---|---|---|---|---|
| Columns | 4 | 4 | 8 | 12 | 12 |
| Gutter | 12 | 16 | 20 | 24 | 24 |
| Side margin | 16 | 24 | 48 | 80 | 120 |
| Content | 268 | 552 | 928 | 1280 | 1680 |

**Only the widest column comes from the design here.** The others are derived,
and they decide how the whole site feels on a phone. (Where the design ships
breakpoint frames, this table is measured instead — see above.) Present the table and get it
signed off before building on it — do not bury it in a commit. Until it is
signed off it is an open question in PROJECT.md, not an assumption in your CSS.

### What to report, and what to ask

Responsive behaviour can't be skipped the way an unmappable layer can, so the
discipline is different from hard rule 2:

- **Apply the default collapse and report it.** These are documented assumptions,
  not guesses.
- **Ask when two collapses are equally plausible** — a landscape card that could
  stack or stay landscape, a spec table that could scroll or reflow to rows, a
  multi-step control that has no obvious narrow form. One question beats a
  rebuild.
- **Use the design's own variant when it exists** — always. A drawn narrow case
  beats every rule on this page. the reference build ships
  `Overlay--drawer - Rental List--empty--Phone`, an older word-form of the same
  suffix; map it to the frame's actual width and flag the naming
  (`name-grammar.md`).
