# `pnpm verify` — checking a theme's build in a browser

A shared tool for every theme, run from inside the theme repo. It drives the **local site** in Playwright's
Chromium and fails on anything the theme owes and does not deliver. `pnpm
release` and `pnpm package` run it first and stop on a failure (see
[The gate](#the-gate)).

```
pnpm verify                      everything, at every width
pnpm verify --only home,drawer   by name (pages, frames, behaviours)
pnpm verify --kind design        rules | design | behaviour
pnpm verify --width 320          one width
pnpm verify --pairs              design | build images for each failing frame section
pnpm verify --headed             watch it
pnpm verify --login admin        save a wp-admin session (.verify/users.local.json)
pnpm verify --as admin           run signed in — the admin bar showing
pnpm verify:pull [frame…]        pull design specs from Figma
```

Before a run: the local site answering, and — when the theme's config names a
`devServer` — `pnpm dev` running in the theme. Both are checked first, and the
run stops with the reason rather than reporting a page of unstyled failures.

## What it checks

**rules** — every page in the config, at every width:

- the page answers with its expected status (200, or 404 for a not-found check)
- no PHP error in the HTML
- no console error, script error, failed request or 4xx/5xx response
- no sideways scroll, and no element past the window's edge; when only a
  pseudo-element overflows, it bisects to the box that holds it
- the theme's stylesheet loaded (a `--prefix-*` property is declared)
- no custom property an element on the page uses that resolves to nothing — the
  failure that drops a whole declaration and reports nothing
- every visible control has an accessible name, every image an `alt`, no id is
  repeated

**design** — each frame in the config, measured against its pulled spec at the
frame's own width. A Figma layer named with a class payload (`group/[.order__items]`)
is found on the page by that payload, and compared on what the design *decides*:

| Compared | How |
|---|---|
| sizing | FIXED → the drawn size; HUG → the element is its content's width (never the sample text's); FILL → it fills its parent |
| padding, gap, direction | auto-layout values, from computed style and the first two children's positions |
| type | family, size, weight, line height, letter spacing, case, colour — for a leaf with one text style |
| surface | background, and each border side (an inset box-shadow rule counts as the side it draws) |

Sample content never fails a check: text-driven widths and heights are not
compared. A layer whose payload is not on the page fails as `present` — the
payload is the CSS contract. ±1px tolerance on lengths.

A frame is `current` (checked, blocks a release) or `stale` (reported, not
checked — the design moved on without it). A screen with no frame at all is
simply not listed; it gets the rules and its behaviours.

**behaviour** — the theme's scripted interactions (`behaviours` in its config),
written with Playwright's `page` and a small `assert`. A behaviour with
`as: 'admin'` runs signed in, from the session `--login admin` saved — for what
only a signed-in visitor sees, like the admin bar. With no saved session it
fails and says how to make one; sessions expire, so re-run `--login` when a
signed-in check reports it is not signed in.

## Writes nothing

Every True Form `submit`, `progress` and `insights` request is answered by the
runner (`{ success: true, reference: "VERIFY-0000" }`). A submission check
reaches neither the plugin's entries, RevitRental, nor an inbox.

## Results

`verify-results/` in the theme repo (gitignored, rebuilt each run): a full-page
screenshot of each failure, `report.json`, and under `pairs/` a **design | build**
image of each failing frame section when run with `--pairs` (each costs a Figma
render, so they are opt-in). Pairs need
`FIGMA_TOKEN`. They are for a person to look at, never a gate — sample content
differs, so a pixel diff would fail on content.

## Mapping a frame's sections

A frame's `roots` map each top-level `pattern[…]` / `part[…]` / `Overlay--…`
layer, by the name in its brackets, to a CSS selector on the page. A pattern
drawn twice is `Name` then `Name #2`. A selector may end in `|n` for the n-th
match (0-based), and start with `?` when the section exists only for some
content (a fifth category list): absent, it is skipped rather than failed. A
section that should be there and is not fails once, on its root.

Recorded design-side spellings go in the config's `design.classes` /
`design.selectors` (an alias per flag), and rulings that hold everywhere in
`design.accept` by `selector`.

## Accepting a difference

A difference the owner has ruled on goes in the frame's `accept` list with the
reason: `{ node: '596:7518', prop: 'border-right', why: '…' }`. It is printed on
every run and never fails it. `node: '*'` / `prop: '*'` widen it — sparingly.

## Specs

`pnpm verify:pull` writes `design/specs/<frame>.json` from
the Figma REST API. Commit them: when the design changes, re-pull, and the diff
is exactly what moved. Needs `FIGMA_TOKEN` — a Figma personal access token with
read-only access to the file — in the shell, the theme repo's `.env`, or
`wp-themes/.env` (both gitignored). A listed `current` frame with no spec fails the run.

Node ids drift. A pull that 404s means the frame was re-created: find it again
and update the config.

## A theme's config

The theme repo's `verify.config.ts`, importing from `@pentadeep/wp-verify`, default export `defineVerifyConfig( { … } )`
(`lib/config.ts` has the types): `origin`, `devServer`, `cssPrefix`, `widths`,
`figma.fileKey`, `pages`, `frames`, `behaviours`, `ignore`. Paths may be
functions that find an id on the live site — never hard-code local data ids.

## The gate

For a theme with a `verify.config.ts`, `pnpm release [version]` and `pnpm package`
run `pnpm verify` before doing anything, and stop if it fails.

- `--skip-verify "<reason>"` is the only way past. The reason is required;
  `pnpm release` writes it into the release commit (`Verify skipped: …`).
- Under `CI=true` the gate stands aside: a runner has no local site, and the
  release it builds already passed the gate where `pnpm release` ran.

## Layout

```
index.ts        the runner
pull.ts         verify:pull
gate.ts         the release gate
lib/config.ts   config types, loading
lib/figma.ts    REST client, frame → spec
lib/inpage.js   the in-browser half (plain JS, evaluated as text)
lib/env.ts      .env
```

`lib/inpage.js` is deliberately not TypeScript: anything a compiler injects
(esbuild's `__name`) would reach a page that does not define it.
