# Design tokens

The design-system half of `figma-to-wordpress`: Figma variables and styles →
`theme.json` presets, base classes, and utility classes. `../SKILL.md` has the
grammar and workflow; `block-mapping.md` has hint → block.

## Phase 1 — enumerate everything, before writing any CSS

**Every project starts with a full inventory of the file's variables and
styles.** Not the tokens one page happens to use — all of them. That inventory
is what the theme's design tokens, base classes, and utility classes are built
from, and it is cheap: two read-only scripts.

Do this *before* `theme.json`, before the first component, before reading a
single layout frame for CSS purposes.

### A style-guide page is documentation, not the source

Files often carry a rendered "Style Guide" page showing the palette, the type
scale and the spacing ladder. **It is a drawing of the tokens, not the tokens**,
and it drifts — the reference file's style guide is already out of step with its
own variables. Read it for the prose (usage notes, intent, which ramp is for
what), and take every value from the variables API.

### Why not `get_variable_defs`

`get_variable_defs` on a layout frame reports only what that frame consumes, so
it systematically under-reports. In the reference file it returned a spacing ladder
with no `3xl` and six of ten font sizes — the actual collection has all twelve
spacing steps and all ten sizes. Worse, it showed **one** text ramp; the file has
**two**, and the second (`Articles/*`, the long-form ramp) appears on no layout
page at all. Build from that and the theme silently ships without a prose ramp.

Use `get_variable_defs` to confirm a specific token is in play. Never as the
inventory.

### The two scripts

Variables — collections, modes, values, scopes:

```js
const hex = (c) => { const h = n => Math.round(n*255).toString(16).padStart(2,'0');
  return '#' + h(c.r) + h(c.g) + h(c.b); };
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const out = [];
for (const c of collections) {
  const modeId = c.modes[0].modeId;
  for (const id of c.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v) continue;
    let val = v.valuesByMode[modeId];
    if (val && val.type === 'VARIABLE_ALIAS') {
      const t = await figma.variables.getVariableByIdAsync(val.id);
      val = 'ALIAS → ' + (t ? t.name : val.id);
    } else if (val && typeof val === 'object' && 'r' in val) val = hex(val);
    out.push({ collection: c.name, name: v.name, type: v.resolvedType,
               value: val, scopes: v.scopes.join('|') });
  }
}
return { count: out.length, variables: out };
```

Styles — text, paint, effect, grid:

```js
const fmt = (v) => (v && typeof v === 'object' && 'unit' in v)
  ? (v.unit === 'AUTO' ? 'auto' : v.value + (v.unit === 'PERCENT' ? '%' : 'px')) : v;
return {
  textStyles: (await figma.getLocalTextStylesAsync()).map(s => ({
    name: s.name, font: s.fontName.family + ' ' + s.fontName.style, size: s.fontSize,
    lineHeight: fmt(s.lineHeight), letterSpacing: fmt(s.letterSpacing),
    case: s.textCase, decoration: s.textDecoration,
    bound: Object.keys(s.boundVariables || {}).join('|') || 'none' })),
  paintStyles: (await figma.getLocalPaintStylesAsync()).map(s => s.name),
  effectStyles: (await figma.getLocalEffectStylesAsync()).map(s => s.name),
  gridStyles: (await figma.getLocalGridStylesAsync()).map(s => s.name)
};
```

Both need the `figma-use` skill loaded first (mandatory before any `use_figma`
call). They return only **local** variables and styles — if a file draws on a
shared library, say so and pull that library separately.

### The third script: resolve the components

Tokens are only half the design system. **Component sets carry the structure
that layer names flatten**, and reading them retires a whole class of guesswork.
Run this once, before building anything:

```js
const page = figma.root.children.find(p => p.name.includes('Components'));
await figma.setCurrentPageAsync(page);
return page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).map(s => ({
  name: s.name,
  variants: s.children.length,
  axes: Object.fromEntries(Object.entries(s.componentPropertyDefinitions || {})
    .map(([k, v]) => [k, v.type === 'VARIANT' ? v.variantOptions : v.type])),
}));
```

And, to tie a laid-out instance back to its definition:

```js
const main = await instance.getMainComponentAsync();
const set  = main.parent?.type === 'COMPONENT_SET' ? main.parent : null;
({ component: main.name, set: set?.name, variant: instance.variantProperties });
```

Four kinds of property come back, and each answers a different question:

| Property type | Answers | Example from the reference file |
|---|---|---|
| **VARIANT** | which composition is this, when one class payload covers several | `card-simple` has `Mast Type: Logo \| Text \| Icon` — three different cards sharing `.card--simple` |
| **TEXT** | what the content schema is | `card--equipment` exposes `Brand`, `Capacity`, `Name`, `Price`, `Number Available` — the custom fields of a post type, named by the designer |
| **BOOLEAN** | which parts are conditional | `Button` has `Leading Icon`, `Trailing Icon`, `showLabel`; `card--equipment` has `isAvailable`, `includesOperator` |
| **SLOT** | where nesting is expected | `Nav-item--has-child` has a `nav-list` slot |

Three consequences worth stating plainly:

- **A variant axis beats a `:has()` guess, every time.** Reconstructing the
  distinction from markup that happens to be present is fragile — in the
  reference build it broke the moment an unset image block stopped rendering.
- **TEXT properties are the content model.** When a card is a query loop, its
  TEXT properties are the fields; you do not have to invent them or ask.
- **`State` axes name the interaction states you owe.** `Default | Hover |
  Processing` on Button means a processing state exists in the design and is
  easy to miss, because no page layout shows it.

### What the inventory produces

| Inventory item | Becomes |
|---|---|
| Colour variables | `theme.json` `settings.color.palette` |
| Spacing variables | `theme.json` `settings.spacing.spacingSizes` |
| Font size / family variables | `theme.json` `settings.typography.fontSizes` / `fontFamilies` |
| Font weight variables | CSS custom properties (no `theme.json` preset exists) |
| Text styles (UI ramp) | **base classes** + **utility classes** — decomposed, one concern each, never one rule per style |
| Text styles (prose ramp) | element rules inside the prose container |
| Grid style | layout width in `theme.json` + the grid utility |
| Paint / effect styles | component CSS (shadows, gradients) |

Report the inventory to the user before building from it. A missing ramp or an
unscoped colour is far cheaper to raise now than after the CSS is written.

## The reference file, as a worked example

One collection, `Primitives`, single mode `Default`, 43 variables. No paint or
effect styles — colour comes from variables only. One grid style, `12-col-grid`.

### Colour — 15

`brand-primary`: `navy-blue` #081657 · `navy-blue-66-31` #1b2e84 ·
`navy-blue-24-98` #f9f9fb
`brand-accent`: `sunglow` #ffca57 · `sunglow - 76-60` #e7b54c ·
`sunglow - 63-50` #cd9b2f
`neutrals`: `white` #ffffff · `gray-95` #f3f3f3 · `gray-87` #dfdfdf ·
`gray-83` #d4d4d4 · `gray-75` #c0c0c0 · `gray-64` #a3a3a3 · `gray-45` #727272 ·
`gray-20` #323232 · `black` #000000

All 15 are `ALL_SCOPES` — they appear in every colour picker in the file,
including stroke and effect pickers. That's a Figma-side cleanup worth flagging;
it doesn't change the code.

### Spacing — 12

`2xs` 2 · `xs` 6 · `sm` 8 · `md` 12 · `base` 16 · `lg` 24 · `xl` 32 · `2xl` 48 ·
`3xl` 56 · `4xl` 64 · `5xl` 96 · `6xl` 128

### Typography — 16

- Family: `primary` Khula, `secondary` Inter
- Size (`FONT_SIZE` scope): `xs` 10 · `sm` 12 · `md` 14 · `lg` 16 · `xl` 18 ·
  `2xl` 20 · `3xl` 24 · `4xl` 32 · `5xl` 40 · `6xl` 56
- Weight (`FONT_WEIGHT` scope): `regular` 400 · `medium` 500 · `semibold` 600 ·
  `bold` 700

Only typography is properly scoped. Copy that discipline when creating
variables, not the colour group's.

## Text styles → base and utility classes

Every text style is bound to the variables for `fontSize`, `fontFamily` and
`fontWeight` — so the ramp is a real token layer, not loose values. **Line height
and letter spacing are not bound** (no primitives exist for them); those numbers
live only in the style and must be copied into CSS by hand.

### Decompose the style; never bundle it

A Figma text style is a bundle of properties. **Do not write it as one CSS rule.**
Split it along the class names the design already uses, so each class owns one
concern and combinations are free:

```css
/* WRONG — one style, one rule. Nothing is reusable. */
.display.fw-bold { font-family: …; font-size: …; line-height: …; font-weight: 700; }

/* RIGHT — each class owns its slice; the markup composes them. */
.display    { font-family: var(--<prefix>-font-primary);
              font-size: var(--<prefix>-size-5xl); line-height: 1; }
.fw-bold    { font-weight: 700; }
.ls-tight   { letter-spacing: -0.02em; }
.uppercase  { text-transform: uppercase; }
```

`Static Pages/Display/Bold` is therefore **`.display` + `.fw-bold` + `.ls-tight`
+ `.uppercase`** — four independent rules — and
`class="display fw-bold ls-tight uppercase"` reconstitutes it. The payoff is that
`.fw-medium` written once serves every role, `.ls-tight` written once serves
every size, and a new combination costs no new CSS at all.

| Class kind | Owns | From |
|---|---|---|
| role — `.display`, `.heading`, `.text`, `.body` | family, size, line-height | the style's first path segment |
| size modifier — `.text--large\|medium\|small\|xsmall` | `font-size` **only** | the size in the style name |
| weight utility — `.fw-regular\|medium\|semi-bold\|bold` | `font-weight` **only** | the style's last path segment |
| tracking utility — `.ls-*` | `letter-spacing` **only** | see below |
| case utility — `.uppercase` | `text-transform` **only** | see below |

**Line height stays on the role class** — unlike weight, case and tracking, it is
what *defines* a role here: `.body` and `.text--small` are the same family and
the same 12px, and differ by nothing but 1.5 against 1.1. Extract it and the two
roles collapse into each other.

Composition is legal and expected: `.text.text--small.fw-bold` is valid CSS even
though the Figma ramp has no `Text Small/Bold`. Don't treat an unlisted
combination as an error — but do check it isn't a misspelling (`.fw-regula`).

### The role and modifier classes

| Class | Family | Size | Line height |
|---|---|---|---|
| `.display` | primary (Khula) | `5xl` 40 | 1.0 |
| `.heading` | primary (Khula) | `3xl` 24 | 1.1 |
| `.text` | secondary (Inter) | from modifier | 1.1 |
| `.text--large` | — | `lg` 16 | — |
| `.text--medium` | — | `md` 14 | — |
| `.text--small` | — | `sm` 12 | — |
| `.text--xsmall` | — | `xs` 10 | — |
| `.body` | secondary (Inter) | `sm` 12 | 1.5 |

| Weight utility | `font-weight` |
|---|---|
| `.fw-regular` | 400 |
| `.fw-medium` | 500 |
| `.fw-semi-bold` | 600 |
| `.fw-bold` | 700 |

Those eight roles/modifiers plus four weights, four tracking utilities and one
case utility reproduce all eleven `Static Pages/*` styles, and a good many the
ramp hasn't drawn yet.

`.body` and `.text--small` are both 12px and differ only in line height (1.5 vs
1.1): `.body` is prose, `.text` is UI. Don't collapse them.

### Tracking and case are utilities, never role properties

Both are presentational choices a designer makes *per usage*, not facts about a
role — and the evidence is that the same role carries different values for each.
So each gets its own single-property utility.

**Tracking.** Figma's letter-spacing percentages are percentages of font size,
which is exactly `em`. The `Static Pages/*` ramp uses five values, one of which
is zero:

| Utility | `letter-spacing` | Figma | Used by |
|---|---|---|---|
| `.ls-xtight` | `-0.03em` | -3% | `Heading/SemiBold` |
| `.ls-tight` | `-0.02em` | -2% | `Display/Bold` |
| *(none — 0 is the default)* | `normal` | 0 | all `Text *` and `Body/*` |
| `.ls-loose` | `0.02em` | 2% | `Display/SemiBold` |
| `.ls-xloose` | `0.12em` | 12% | `Text xSmall/Regular` |

Zero gets no class. A role's default is `letter-spacing: normal`, and a payload
adds a `.ls-*` only where the design departs from it.

Extracting tracking also **resolves** an apparent conflict rather than forcing a
ruling on it. `Display/Bold` is -2% and `Display/SemiBold` is +2% — same role,
same size, opposite sign. Bundled, that's a contradiction someone has to
adjudicate; decomposed, it is simply two payloads, `.display.fw-bold.ls-tight`
and `.display.fw-semi-bold.ls-loose`. Still worth asking the designer whether the
+2% was intended, but the CSS no longer waits on the answer.

**Case.** Two styles bake in `textCase: UPPER` — `Display/Bold` and
`Text xSmall/Regular`. `Display/SemiBold` is not uppercase, so `text-transform`
on `.display` would wrongly uppercase it. `text-transform` lives in `.uppercase`
and nowhere else. The file spells that utility two ways, `.uppercase` and
`.upper-case`; pick `.uppercase`, use it everywhere, flag the other.

**The naming gap both create.** A layer whose Figma style carries UPPER or a
non-zero tracking, but whose payload has neither the `.uppercase` nor the `.ls-*`
class, will render without it. `h1/[.display.fw-bold]` is one — it needs
`.uppercase.ls-tight` to match its own text style. Report every such layer so the
payload gets the classes; do not quietly special-case the CSS to compensate.

This is what decomposition buys beyond reuse: a bundled style hides its own
inconsistencies, and splitting it surfaces them the moment two styles share a
class.

### `Articles/*` — the long-form ramp

Used by no layout page in `✒️ HiFi - Desktop`, which is exactly why Phase 1
exists. This is the prose ramp — the styles a post/article body needs.

| Style | Font | Size | LH | LS |
|---|---|---|---|---|
| `Title (H1)` | Khula Bold | 40 | 1.2 | -2% |
| `Heading (H2)` | Khula SemiBold | 32 | 1.2 | -2% |
| `Sub-Heading (H3)` | Khula SemiBold | 24 | 1.3 | -1% |
| `Sub-Heading 2 (H4)` | Inter Semi Bold | 18 | 1.4 | 0 |
| `Paragraph/Regular` | Inter Regular | 16 | 1.7 | 0 |
| `Paragraph/Semi Bold` | Inter Semi Bold | 16 | 1.7 | 0 |
| `List Item` | Inter Regular | 16 | 1.7 | 0 |
| `Link` | Inter Medium | 16 | 1.7 | 0 |
| `Caption` | Inter Regular | 12 | 1.5 | 0 |
| `Block Quote` | Khula SemiBold | 20 | 1.5 | -1% |

This ramp is **element-scoped, not class-scoped**: it styles `h1`–`h4`, `p`,
`li`, `a`, `blockquote`, `figcaption` inside a prose container (`.post__content`
or equivalent), because the content comes from the editor and carries no BEM
classes. So it composes no utilities — each element rule sets its own tracking
directly, drawing on the same `--<prefix>-ls-*` custom properties.

One value here sits outside the scale: `Sub-Heading (H3)` and `Block Quote` use
**-1%**, between `.ls-tight` and normal. Either it wants a fifth step or it was
meant to be -2% like the two headings above it — worth one question to the
designer before it hardens into a literal in the stylesheet. Two different jobs: `Static Pages/*` styles chrome you author,
`Articles/*` styles content someone else writes.

## `theme.json` mapping

| Figma family | `theme.json` |
|---|---|
| `color/<group>/<name>` | `settings.color.palette[]` |
| `spacing/<step>` | `settings.spacing.spacingSizes[]`, with `spacingScale.steps: 0` so WordPress doesn't generate a competing ladder |
| `typography/font-size/<step>` | `settings.typography.fontSizes[]` |
| `typography/font-family/<role>` | `settings.typography.fontFamilies[]` |
| `typography/font-weight/<name>` | no preset — `settings.custom` or plain CSS custom properties |
| grid style width | `settings.layout.contentSize` / `wideSize` |

**Keep Figma's slugs** — `sm`, `2xl`, `brand-primary`, `gray-45`. It keeps the
design file and `theme.json` greppable against each other, which is the point of
a token layer. And preset slugs are expensive to change later: they end up in
saved post content as `has-<slug>-color` classes.

**Ship the whole ladder, and nothing more.** Register every step the collection
defines, even ones no current screen uses — they're the designer's vocabulary for
the next screen. Never interpolate a step that isn't there.

**Write the presets in `rem`.** Figma reports px; px is the unit of the design
file, not of the stylesheet. Convert at this boundary — `px ÷ 16` — and nowhere
below it. `spacing/lg` 24 is registered as `1.5rem`, `contentSize` 1200 as
`75rem`. See `css-architecture.md` §Units for the full rule; no raw pixel value
ships.

## Fonts are self-hosted, always

Never a Google Fonts (or any other) CDN link — no third-party request on page
load, no referrer leaving the site, nothing to break when the CDN does. Ship the
files with the theme:

- **`woff2` only.** Every browser the theme supports reads it; older formats
  double the payload for nobody.
- **Only the weights the ramp actually uses.** The Phase 1 inventory already told
  you which — read the `fontWeight` of every text style and ship exactly that
  set. A family with four weights where the design uses two is half waste.
- **Subset to the scripts the site needs** (usually latin, or latin + latin-ext).
- Files live in the shipping directory, e.g. `wp/assets/fonts/<Family>/`.
- Declare them in `theme.json` under the family's `fontFace`, so the **editor**
  loads them too. A stylesheet-only `@font-face` leaves the editor rendering in a
  fallback, and every spacing judgement made there is then wrong:

```json
{
  "slug": "primary",
  "name": "Primary (Khula)",
  "fontFamily": "Khula, 'Segoe UI', system-ui, sans-serif",
  "fontFace": [
    { "fontFamily": "Khula", "fontWeight": "600", "fontStyle": "normal",
      "fontDisplay": "swap",
      "src": [ "file:./assets/fonts/Khula/khula-v17-latin-600.woff2" ] }
  ]
}
```

`fontDisplay: swap` keeps text readable while the file loads, and every family
still needs a real fallback stack — a font that 404s should degrade, not vanish.

**Verify every `src` resolves to a file that exists.** A typo'd path fails
silently: the site simply renders in the fallback, which is easy to miss and
makes every other spacing decision suspect.

## Custom properties

### WordPress rewrites your slugs — alias the name it emits, not the one you wrote

Core runs every preset slug through `_wp_to_kebab_case()` before building the
custom property (`class-wp-theme-json.php`), and that function **splits a digit
from a following letter**:

| theme.json slug | Emitted custom property |
|---|---|
| `2xs` `2xl` `3xl` `4xl` `5xl` `6xl` | `--wp--preset--spacing--2-xs`, `--…--2-xl`, `--…--3-xl` … |
| `gray-95` `navy-blue-66-31` | unchanged — a digit already separated by a hyphen is safe |

So the Figma-native `2xl` becomes `2-xl` in CSS. Referencing the un-kebabed name
gives an **undefined variable, and CSS fails silently**: the whole declaration is
dropped, so the padding doesn't shift — it disappears. That is easy to mistake
for a layout bug and hard to spot by eye.

Keep the Figma slug in `theme.json` (it is the design system's name, and the
editor shows the `name` field anyway) and alias the emitted name in CSS, with a
comment saying why. Then verify it, rather than trusting it: extract every
`--wp--preset--*` / `--wp--custom--*` the stylesheet references, kebab-case each
`theme.json` slug the way core does, and fail on any reference that doesn't
resolve. Run it whenever tokens change — this class of bug produces no error
anywhere.

## Custom properties, continued

Presets emit `--wp--preset--color--brand-primary` and friends. Alias them **once**
to the theme's own short properties, and write components against those:

```css
:root {
  --<prefix>-color-brand-primary: var(--wp--preset--color--brand-primary);
  --<prefix>-space-lg: var(--wp--preset--spacing--lg);
}
```

Line height and tracking have no Figma primitives and so no presets — define
those custom properties outright (`--<prefix>-ls-tight: -0.02em`), and let both
the `.ls-*` utilities and the prose element rules draw on them. One definition,
two consumers.

Prefix every custom property with the theme's own prefix, per the repo
convention — never reuse another theme's.

Alias, don't duplicate. A hex value that appears in both `theme.json` and a CSS
file will drift.

## Where the palette actually applies

Presets give editor users a colour picker and generate `has-…-color` utility
classes. But in this convention components carry their own BEM classes and take
colour from CSS, not from block attributes. So:

- Register the full palette — it's the token contract, and the editor needs it.
- Set global and per-block defaults in `styles` / `styles.blocks` so unstyled
  core blocks land in the design system rather than on browser defaults. This is
  also where the `Articles/*` ramp goes for core prose blocks.
- Don't scatter `backgroundColor`/`textColor` attributes through pattern markup
  to colour components that already have a class. That splits one decision
  across two files.
