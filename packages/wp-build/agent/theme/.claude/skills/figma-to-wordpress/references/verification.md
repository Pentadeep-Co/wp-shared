# Verification

A 1:1 replica is not something you write — it is something you **check**. This
file is the checking.

The reason it needs its own discipline: almost nothing in this stack fails
loudly. An undefined custom property drops its declaration and says nothing. A
rule that loses on specificity says nothing. A class with no rule at all says
nothing. The build passes, the page loads, and the result is quietly wrong. Every
defect in the reference build reached the browser green.

Run these in order. The first two are cheap and catch whole classes of error; the
third is the one that makes the page match.

## 1. Preset references resolve

WordPress kebab-cases preset slugs (`2xl` → `2-xl`, see `design-tokens.md`), so
an alias can point at a name that never existed. The failure is invisible.

Extract every `--wp--preset--*` / `--wp--custom--*` the stylesheet references,
apply core's own `_wp_to_kebab_case()` to each `theme.json` slug, and fail on any
reference that doesn't resolve. Take the function from the WordPress install
rather than reimplementing it — the transformation has more edge cases than it
looks:

```php
// wp-includes/functions.php :: _wp_to_kebab_case()
```

Run it whenever tokens change. Expected output is a count, not a list.

## 2. Every class in the markup has a rule

Collect the class attributes from the rendered patterns and parts, drop the
`wp-block-*` / `wp-element-*` / `has-*` / `is-style-*` prefixes, and check each
remaining class appears somewhere in `src/css`.

A named element with no CSS is a bug, not a default — it is how a centred block
ends up left-aligned. When a class legitimately needs no rule, say so in a
comment block listing the class and the reason, so the check stays meaningful
instead of accumulating exceptions nobody remembers.

## 3. Diff computed values against the design, in a browser

**This is the step that makes the build a replica**, and it is not optional. You
cannot see the output of your own work any other way: reading your CSS tells you
what you intended, not what the browser resolved.

Load the local site, then compare `getComputedStyle` against the values
`get_design_context` reported, in a single script:

```js
const chk = (sel, prop, want) => {
  const el = document.querySelector(sel);
  if (!el) return { sel, got: 'MISSING' };
  const got = getComputedStyle(el)[prop];
  return { sel, prop, want, got, ok: got === want };
};
[
  chk('.card.card--simple', 'padding', '32px'),
  chk('.section__header',   'paddingTop', '128px'),
  // …one line per measured value that matters
];
```

Work one pattern at a time, from the measurements you transcribed into
`design/measurements/<task>.md` when you took them.

**Run this at every width the design drew.** Resize to each frame's width and
diff against that frame's measurements; a pattern that matches at 1440 and was
never checked at 768 is a pattern verified at one third of its specification. At
widths the design didn't draw, check that the derived collapse actually happens
and that nothing overflows — there is no measurement to diff against, which is
exactly why those widths need eyes. Anything
returning `ok: false` is a defect; anything returning `MISSING` means the markup
and the CSS disagree about the shape of the DOM.

Three further things the browser answers that nothing else can:

- **Which rule actually won.** Walk `document.styleSheets`, collect every rule
  whose selector matches the element and sets the property in question, and read
  the list. That is how you find a `:root :where(…)` reset beating you on source
  order, in seconds rather than by inspection.
- **What the DOM really looks like.** See §4.
- **Whether anything overflows.** Compare `document.documentElement.scrollWidth`
  with `clientWidth`, and list elements whose right edge exceeds the viewport.

## 4. Inspect a core block's rendered DOM before writing selectors for it

The markup a block emits is routinely deeper than the block implies, and the
extra levels are undocumented and unthemeable. `core/navigation` is the worst
offender:

```
nav.wp-block-navigation
  div.wp-block-navigation__responsive-container
    div.wp-block-navigation__responsive-close
      div.wp-block-navigation__responsive-dialog
        div.wp-block-navigation__responsive-container-content
          ul.wp-block-navigation__container
            ul.wp-block-page-list        ← only when no menu is assigned
              li.wp-block-navigation-item
                a
```

Four wrapper divs and a conditional second `<ul>` between `<nav>` and `<li>`,
every one auto-height. Print the ancestor chain with each level's computed
`display`, `height` and `flex` before writing a single selector:

```js
let el = document.querySelector('<the leaf>'), chain = [];
while (el && el !== document.body) {
  const cs = getComputedStyle(el);
  chain.unshift({ tag: el.tagName, cls: el.className,
                  display: cs.display, height: cs.height, flex: cs.flex });
  el = el.parentElement;
}
chain;
```

Two consequences worth knowing in advance: scope rules for repeated items to the
**top level** (a descendant selector also catches submenu entries), and never
build a percentage-height chain through wrappers you do not control.

## 5. Separate theme defects from site configuration

The theme can be correct and the page still wrong. Before reporting a defect,
check whether the cause is unset content:

- **No menu assigned** — `core/navigation` falls back to a page list, so the
  items are auto-generated from pages rather than the designer's five.
- **No site logo set** — `core/site-logo` renders nothing and its cell is empty.
- **No images set** — `core/image` blocks show their placeholder.
- **Patterns not appearing** — WordPress caches the `patterns/` directory scan
  against the theme version. `define( 'WP_DEVELOPMENT_MODE', 'theme' );` in
  `wp-config.php` disables that cache for local work.

Report these separately from CSS defects, and never "fix" them in CSS.

## The loop

Measure → markup → CSS → **build → load → diff → fix → re-diff** → tick →
**gate 1** → **gate 2** → next task.

The tick is a PROJECT.md acceptance box, and it goes in only after the check has
actually run (`project-file.md`). A box ticked on intent is worse than an empty
one, because it stops the next session from looking.

The two gates close the task:

- **Gate 1 is yours.** Every box ticked, every check above run, the node re-read
  and the values re-diffed *after* your last edit — then say so plainly:
  "checked and re-checked against the design; checks 1-5 pass". Status becomes
  `verified`.
- **Gate 2 is a person's.** Hand over the URL, what to look at, and what you know
  is imperfect, then wait. Only the reviewer moves a task to `accepted`. Silence
  is not acceptance, and neither is being told to get on with something else.

This is a human-in-the-loop system: the checks in this file tell you whether the
browser agrees with your measurements, which is a narrower question than whether
the build is right.

Verify per pattern, not once at the end. Each of these defects was found only
because a later pass looked again at something an earlier pass had called done:
the section padding that vanished into an undefined variable, the nav cells at
13px in an 80px bar, the card padding lost to a reset. None was visible in the
source.
