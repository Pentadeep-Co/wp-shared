# Accessibility

A design file states what a sighted mouse user sees. It says almost nothing about
what a screen reader announces or what order the keyboard moves through — and
those are not a polish pass, they are half the interface.

So: **where the design does not specify the accessible semantics, you supply
them.** That is not improvising structure (hard rule 2) — the element is already
named and mapped; you are naming what it *is* to a reader who can't see it. What
you must not do is leave it out because the design was silent.

## The order that matters

Two things carry most of the weight, and both are decided by markup you are
already writing:

1. **DOM order is focus order.** Never reorder with CSS what the design ordered
   visually — `order`, `row-reverse`, `position: absolute` and grid placement all
   move the picture without moving the tab sequence, and the result is a keyboard
   user tabbing backwards through a row. Where a design's visual order differs
   from its reading order, that is a question for the designer, not a `tabindex`.
2. **Never a positive `tabindex`.** `0` to make something focusable, `-1` to make
   it programmatically focusable, nothing else. A positive value jumps the
   element to the front of the whole page's order.

## Per element

Core blocks get most of this right when you give them the right block. The
column below is what to add when the design didn't say.

| Element | Supply |
|---|---|
| `part[Header]` / `part[Footer]` | `tagName: header` / `footer` on the template part, so the landmarks exist |
| `nav` | `core/navigation` renders `<nav>`; add `aria-label` when there is more than one (`Primary`, `Footer`, `Breadcrumb`) |
| `group<section>` | a section is only a landmark with an accessible name — `aria-labelledby` pointing at its own `.section__heading`, or no `<section>` at all |
| `h1`–`h4` | one `h1` per page; never skip a level to get a size — size is a utility class, not a heading level |
| decorative `icon` | `aria-hidden="true"`, and no accessible name. An icon beside a text label is always decorative |
| meaningful `icon` (the only content of a control) | the name goes on the **control**, not the icon: `aria-label="Next testimonial"` on the button |
| `image` | real `alt` when it carries meaning; `alt=""` when it repeats adjacent text or is ornament. An empty `alt` is a decision, a missing `alt` is a bug |
| `button` vs `>link` | a link navigates, a button acts. The design draws both as a rounded rectangle; the name tells you which, and the wrong one breaks Enter/Space behaviour |
| `input` | every field has a real `<label>`; placeholder is never the label. Add `inputmode` and `autocomplete` (`block-mapping.md` §Forms) |
| field errors | `aria-describedby` to the message, `aria-invalid` on the field, and the message must be text, not colour |
| `.faq__item` accordion | the header is a `<button>` with `aria-expanded`, controlling the panel via `aria-controls`; `.faq__item--expanded` is state, so it must be reflected in `aria-expanded`, not only in a class |
| carousel / testimonial arrows | real buttons with labels, and the region gets `aria-roledescription` only if you also handle keyboard paging — otherwise leave it a plain list |
| `rating-stars` | one `role="img"` with `aria-label="Rated 5 out of 5"` on the container, and `aria-hidden` on the individual stars — never five announced images |
| `Overlay--` drawer / modal | `role="dialog"`, `aria-modal="true"`, an accessible name, focus moved in on open and restored on close, focus trapped while open, `Esc` closes |
| `pagination` | `core/query-pagination` in a `<nav aria-label="Pagination">`; the current page gets `aria-current="page"` |
| skip link | one, first in the DOM, to `#main` — the header is a lot of nav to tab through on every page |

## Focus must be visible

Every interactive element needs a `:focus-visible` style that is *yours*, not the
browser's default outline sitting on top of a dark section where it disappears.
Two rules: never `outline: none` without a replacement, and the indicator needs
3:1 contrast against what's behind it.

`css-architecture.md` §Touch carries the sizing side — ≥44px targets, ≥16px
inputs, and hover gated behind `(hover: hover) and (pointer: fine)` so a touch
device doesn't get stuck in a hover state it cannot leave.

## Colour and motion

- **Contrast is a design property, so measure it rather than assume it.** Check
  the design's own pairs — body text on the page surface, labels on brand fills,
  placeholder text, disabled states, and the focus ring. A pair that fails is a
  finding for the designer (flag ledger), not something to silently darken.
- **Never colour alone.** An error state that is only red, a selected tab that is
  only tinted, a required field marked only by colour — each needs a second
  signal in text or shape.
- **`prefers-reduced-motion`** gates every transition and animation that moves
  something across the screen. The `web-animation-design` skill has the detail.

## What to verify

Add to the per-task browser pass (`verification.md`):

- **Tab through the pattern.** Every control reachable, order matches reading
  order, focus always visible, nothing focusable inside a closed overlay.
- **Check the accessibility tree**, not the markup — names, roles and states as
  computed, which is where an `aria-labelledby` pointing at a removed id shows up.
- **Headings outline** — one `h1`, no skipped levels.
- **Landmarks** — one `header`, one `footer`, one `main`, named `nav`s.

None of this fails loudly either. An `aria-controls` pointing at nothing, a label
that was never rendered, a focus trap that lets focus escape behind the overlay:
the page looks perfect and is unusable for the person relying on it.
