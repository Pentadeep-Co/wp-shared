# Block mapping

Lookup tables for `figma-to-wordpress`. `../SKILL.md` has the grammar, the
workflow and the hard rules; `design-tokens.md` has variables and
`theme.json`. This file answers "what does this layer become".

Throughout, `<prefix>` is the theme's unique prefix (repo convention — never
reuse another theme's).

**Nothing here ever resolves to `wp:html`.** Where core has no honest block, the
answer is either a CSS-only treatment on the class the payload already gives you,
or *skip and flag*. Both are spelled out below.

## Structural wrappers → files

### `part[Header]` → `wp/parts/header.html`

Referenced from every template:

```html
<!-- wp:template-part {"slug":"header","area":"header","tagName":"header","className":"header"} /-->
```

The `part[…]` node in Figma is an instance with no children exposed — open the
component itself to build the part's innards.

### `pattern[Section - FAQ]` → `wp/patterns/section-faq.php`

Slug = the name lowercased, ` - ` and spaces collapsed to single hyphens.

```php
<?php
/**
 * Title: Section - FAQ
 * Slug: <prefix>/section-faq
 * Categories: <prefix>
 * Inserter: yes
 */
?>
<!-- the pattern root's own markup starts here -->
```

The pattern's **root block is the third segment of its own name** —
`pattern[Section - FAQ]/group<section>/[.section]` means the file opens with a
`core/group`, `tagName: section`, `className: section`. Referenced from a
template:

```html
<!-- wp:pattern {"slug":"<prefix>/section-faq"} /-->
```

A `wp:pattern` reference stays dynamic only while the template is uncustomised in
the Site Editor — once a user saves that template, the reference is flattened.
Fine for static sections; for anything that must keep updating, say so.

**The file is PHP, so use PHP.** Compute anything dynamic — a breadcrumb trail,
a term list, a price — in PHP and `echo` it *inside block markup*. What leaves
the file is always blocks:

```php
<!-- wp:paragraph {"className":"breadcrumbs body fw-regular"} -->
<p class="breadcrumbs body fw-regular"><?php echo wp_kses_post( $trail ); ?></p>
<!-- /wp:paragraph -->
```

That is the replacement for almost every case that would otherwise reach for
`wp:html`.

### `Page--X` → `wp/templates/*.html`

The whole template body is the page frame's child list:

```html
<!-- wp:template-part {"slug":"header","area":"header"} /-->
<!-- wp:pattern {"slug":"<prefix>/hero-left"} /-->
<!-- wp:pattern {"slug":"<prefix>/client-logos"} /-->
<!-- wp:template-part {"slug":"footer","area":"footer"} /-->
```

### `Overlay--X` → no template

Drawers and modals are global UI. Render the markup from `wp_footer` (or a
template part included by the header part) so every template inherits it, and
drive it from `src/ts/`. State variants (`--empty`) are the same markup with a
different branch, not a second file. This is not a block context — plain PHP
output is correct here, and the no-`wp:html` rule doesn't apply.

## Element hint → block

| Hint | Block | Notes |
|---|---|---|
| `group` | `core/group` | `tagName: div` |
| `group<section\|header\|article>` | `core/group` | set `tagName` to the angle-bracket tag |
| `aside` | `core/group` | `tagName: aside` |
| `nav` | `core/group` `tagName: nav` | the attribute renders `<nav>`, but `nav` is not in the editor's tagName dropdown — an editor round-trip can lose it. Use `core/navigation` **only** for the real site menu in the header part; it brings menu management with it |
| `nav>link`, `paragraph>link`, `span>link` | the element block, content wrapped in `<a>` | not two blocks |
| `h1`–`h4` | `core/heading` | `level` from the hint |
| `paragraph` | `core/paragraph` | |
| `span` | *no block* | inline markup, or a CSS treatment — see below |
| `list` + `list-item` | `core/list` + `core/list-item` | **only if items are inline text** — see caveat |
| `image` | `core/image` | `className` lands on the `<figure>` |
| `icon` | `core/image`, or CSS | see "Icons" |
| `button` | `core/buttons` > `core/button` | see the className caveat |
| `form`, `fieldset`, `label`, `input` | True Form plugin | see "Forms" |
| `pagination` | `core/query-pagination` | only valid inside `core/query` |
| `pagination-previous` / `-next` | `core/query-pagination-previous` / `-next` | `.disabled` in the name is WordPress's own state — don't hand-code it |
| `breadcrumb(s)` | `core/paragraph` with PHP-computed content | see the pattern-is-PHP note above |
| `[.x::before]` | *nothing* | pseudo-element; CSS only |

Every one of these takes the class payload verbatim as `className`.

```html
<!-- wp:group {"tagName":"section","className":"section section--hero section--hero--left"} -->
<section class="wp-block-group section section--hero section--hero--left"></section>
<!-- /wp:group -->

<!-- wp:heading {"level":2,"className":"section__heading fw-semi-bold"} -->
<h2 class="wp-block-heading section__heading fw-semi-bold"></h2>
<!-- /wp:heading -->
```

### Caveat: `core/list-item` holds inline content only

`list/[.faq__list]` > `list-item/[.faq__item]` > `group/[.faq__item__header]` >
`h3` + `image` cannot be a `core/list`; list items take rich text and nested
lists, nothing else. Build it as **`core/group` carrying the list classes**,
styled as a list in CSS. That loses `<ul>`/`<li>` semantics — acceptable for an
FAQ or accordion, where the items are headings and prose, but say so in the
build report. If the content is a genuine list that needs list semantics for
accessibility, that is a skip-and-flag: the design needs a different structure.

`core/list` works directly only when the items really are inline text —
`list-item/[.list--vertical__item]` > `span/[.item__text]`.

### Caveat: `core/button`'s className lands on the wrapper

```html
<!-- wp:button {"className":"btn btn--primary btn--large"} -->
<div class="wp-block-button btn btn--primary btn--large">
  <a class="wp-block-button__link wp-element-button">Reserve</a>
</div>
<!-- /wp:button -->
```

The BEM classes sit on the `<div>`, but `.btn--primary` is almost always meant
for the clickable surface. Style through the wrapper —
`.btn.btn--primary > .wp-block-button__link` — and keep that shape for every
button in the theme. Do not reach for raw HTML to get the class onto the `<a>`.

### Icons

**Export them; do not leave the slot empty.** A `core/image` with no source
**does not survive to the front end** — WordPress renders nothing, the element is
absent from the DOM, and any CSS that keys off it (`:has(> .card__icon)`, a
sibling selector, a layout rule) silently stops matching. An "editor placeholder"
is not a working intermediate state.

`download_assets` gives you the real file:

```
download_assets { fileKey, nodeId: <the icon variant>, defaultFormat: "svg" }
```

Two entries come back and they are **not** interchangeable:

- **`svgAssets`** — the extracted vector, clean. This is the one you want.
- **`export`** — the node rendered, which includes whatever canvas chrome
  surrounds it. On the reference file that meant a grey backing rectangle and
  the enclosing frame's border baked into the file.

The icon set's variant axis gives you the whole inventory with semantic names —
`envelope`, `whatsapp`, `list`, `crane`, `road-closed`, `check` — so the export
is a loop over `componentPropertyDefinitions.Name.variantOptions`, saved to
`wp/assets/icons/<name>.svg` and referenced from the pattern.

Only then do the routes below apply.

#### The icon block is the primary route

The theme registers **one custom block for the whole icon set** (`BLK-` task,
`project-file.md`). It holds every exported icon and takes three attributes:

```html
<!-- wp:<prefix>/icon {"name":"arrow-head-right","size":"md","color":"accent-deep","className":"link__icon"} /-->
```

| Attribute | Takes | Notes |
|---|---|---|
| `name` | an icon slug from the set | in the editor this is a searchable picker; in markup it is just this string |
| `size` | a spacing/size preset slug, or a `rem` value | never px |
| `color` | a `theme.json` palette slug or custom property | resolves to a preset, not a literal |
| `className` | the layer's class payload | unchanged from every other block |

The search UI exists only in the editor. Written by hand in a pattern, the block
is the three attributes above — which is why the icon set must be inventoried
(`figma-extraction.md`) before any pattern that uses one is built.

**Why a custom block rather than `core/image`.** An `<img>` cannot take a colour
from CSS. In the reference build that forced `filter: brightness(0) invert(1)` to
put a black-exported mark on a navy footer, which is exact only for pure black
and cannot express the design's gray-45 marks at all. The block renders inline
SVG, so `fill: currentColor` does the job the design actually specified, in one
place, for every icon.

This is a block the theme registers, so it satisfies hard rule 1: it is editable,
inspectable, and has an inspector panel. It is not `wp:html` with extra steps.

#### Until the block exists

A theme that has not yet built it falls back to:

- **Decorative icon inside a component** — `.btn__icon`, `.link__icon`,
  `.checkbox__icon`, `.faq__toggle`, `.card__icon`. Emit no block. Style the
  class with `mask-image` plus `background-color: currentColor`, so the icon
  inherits colour the way an inline SVG would.
- **Standalone meaningful image** — `core/image` pointing at the SVG asset, with
  the class payload on the figure, and `alt` per `accessibility.md`.

Both are transitional. Record the swap as a `BLK-` task rather than leaving the
fallback to harden into the theme's icon story.

### Inline and decorative `span`

- **Child of a text node** (`h3` > `span`, `paragraph` > `span`): inline markup
  *inside* that block's rich text — `<span class="link__label">…</span>` — never
  a sibling block. This is the common case and it is fully supported.
- **A rule or divider** (`span/[.divider]`): `core/separator` with the class.
- **A pure decoration** (`span/[.square]`, `span/[.hero__line--vertical]`): these
  are `::pseudo` layers that weren't named as such. Emit nothing, style the
  parent's `::before`/`::after`, and flag the naming so it can be corrected.

### Forms

There is no core form block, and `wp:html` is not the answer. Route by what the
form does:

- **Submits data** — the True Form plugin. See the `wp-trueform-integration`
  skill. `form/[.form.form--rental-request]` becomes a code-defined form;
  `fieldset` / `label` / `input` map to its field blocks; the class payloads
  carry through. `input/[.checkbox]`, `input/[.input--date]`,
  `input/[.input--tel]` name the field types directly. Flag every personal-data
  field as PII. Carry `inputmode` and `autocomplete` on every field — they decide
  which keyboard a phone opens, and the design can't express them.
- **Plain site search** — `core/search`, with the class payload on it.
- **A filter or faceted GET form** (`aside/[.filter-sidebar]`,
  `group/[.hflex--search-form]`) — no core block covers this. Skip and flag, and
  let the developer choose between a True Form form, a small custom block, and a
  PHP-rendered pattern.

## Loop context

When a card subtree is a query loop (`../SKILL.md` §"Spot the query loops"), the
inner names change block:

| Layer | Static | In `core/post-template` |
|---|---|---|
| `group<article>/[.card…]` | `core/group` `tagName: article` | the `core/post-template` item wrapper |
| `h3/[.card__title]` | `core/heading` | `core/post-title` (`level`, `isLink`) |
| `image/[.card__image-src]` | `core/image` | `core/post-featured-image` |
| date in `.card__meta` | `core/paragraph` | `core/post-date` |
| excerpt `paragraph` | `core/paragraph` | `core/post-excerpt` |
| `span/[.product__tag]` | `core/paragraph` | `core/post-terms` |
| `.spec__value`, `.price__value` | `core/paragraph` | custom field → **block bindings** (`metadata.bindings`, WP 6.5+) |

Wrap in:

```html
<!-- wp:query {"queryId":<n>,"query":{"postType":"<cpt>","perPage":12}} -->
<div class="wp-block-query">
  <!-- wp:post-template {"className":"section__body-row"} --> … <!-- /wp:post-template -->
  <!-- wp:query-pagination {"className":"pagination"} --> … <!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
```

Assign `queryId`s deliberately and record them in the theme's docs — filtering
hooks key off them.

### The annotation is authoritative

A Development annotation on the loop's wrapper states the post type and the
filters:

```
@query post_type=equipment, tax=equipment_category:excavators, per_page=6, orderby=menu_order
```

**Where one exists, build exactly that** — it overrides every inference from the
markup, including the "is this a loop at all" question in `../SKILL.md` §"Spot the
query loops". Where none exists, the heuristics there hold, and the post type you
chose becomes an open question in PROJECT.md rather than a silent decision.

### Custom post types come from ACF

CPTs and their fields are registered through ACF, not hand-rolled in
`functions.php`. Two consequences for the markup:

- **Custom fields bind, they don't print.** A `.spec__value` or `.price__value`
  is `core/paragraph` with `metadata.bindings` pointing at the ACF field, not PHP
  echoing a value into the block. The component set's TEXT properties
  (`figma-extraction.md` §5) are the field list — `Brand`, `Capacity`, `Name`,
  `Price`, `Number Available` — so the schema is the designer's, not invented.
- **The field names must be agreed before the binding is written**, because a
  renamed field breaks the binding silently: the block renders empty, with no
  error.

### When the CPT does not exist yet

Do not block the pattern on it, and do not fake it with static markup that will
be forgotten. **Ship the loop as a stub:**

- the real `core/query` / `core/post-template` structure, with the intended
  `postType` already set,
- `core/post-title`, `core/post-featured-image` and the rest in place,
- bindings written against the agreed field names even though they resolve to
  nothing yet,
- a `<!-- stub: CPT <name> pending -->` comment at the top of the pattern file.

An unregistered post type makes the query return nothing, so the section renders
empty rather than wrong — which is the honest state, visible immediately, and it
becomes correct the moment the CPT is registered without the markup changing.
Record it as a blocked task with the CPT task as its dependency.
