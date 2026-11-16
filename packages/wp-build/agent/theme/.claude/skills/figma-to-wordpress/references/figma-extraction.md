# Figma extraction

Phase 1. Read the design file **once, completely, to disk**, and produce the
inventory every later phase reads from.

## Why this goes to disk

`get_metadata` on a single page canvas returns ~160KB. A real file has a handful
of layout pages, a components page, and a set of overlay frames; the whole file
is megabytes. None of it fits in context, and the failure mode when it doesn't
fit is not an error — it is a model that has seen frame 1, lost it by frame 9,
and starts inferring structure from the screenshot. That is precisely the failure
hard rule 3 exists to prevent, arriving through the back door.

So: **every extraction call writes a file, and later phases grep those files.**
Nothing large is ever held in context, and nothing is read twice from Figma when
it can be read from disk.

## What "read everything" means

Two different reads, at two different times, for a reason:

| Read | When | Gives |
|---|---|---|
| **Identity** — `get_metadata` per top-level frame | Phase 1, all frames | every node's id, name, type, position, size. This is what the task list is built from. |
| **Values** — `get_design_context` per node | Phase 3, per task, just before styling it | spacing, colour, alignment, size, and the token each came from |

Phase 1 reads every node's *identity*. Phase 3 reads each node's *values* as it
builds it. The split is not a shortcut — it is because **values drift and
identity doesn't**. Two reads of the same node minutes apart can differ, and the
later one wins; a measurement taken in Phase 1 and used three sessions later is a
measurement of a design that no longer exists. Structure, by contrast, is stable
enough to plan against, and planning is what Phase 1 is for.

## The artifact directory

```
design/
  PROJECT.md                    the task list (project-file.md)
  file-map.md                   pages → top-level frames → what each becomes
  frames/
    hifi-desktop--page-home.xml
    hifi-desktop--page-about.xml
    hifi-desktop--overlay-drawer-rental-list.xml
  tokens/
    variables.json              collections, modes, values, scopes
    styles.json                 text, effect, grid styles
  components/
    component-sets.json         every set, its variant axes and properties
    instances.json              laid-out instance → main component → variant
  motion/
    reactions.json              prototype interactions per node
    transitions.json            get_motion_context output per animated node
  annotations.json              every node.annotations, by node id
  measurements/                 filled during Phase 3, one file per pattern
    section-faq.md
```

Commit `PROJECT.md`, `file-map.md` and `annotations.json` — they are the record.
The bulk dumps (`frames/`, `tokens/`, `components/`) are reproducible from the
file in one pass, so gitignoring them is reasonable; what is not reasonable is
treating a stale dump as current. Record the extraction date at the top of
`file-map.md` and re-extract when the design moves.

## Order of work

### 1. Get the file

If the user hasn't given you a Figma URL, ask — this is the one input nothing can
proceed without. What you need:

- the **file key** (from `figma.com/design/<key>/<name>`),
- **which pages** are in scope — files carry scratch pages, and building from an
  abandoned one is unrecoverable later,
- whether a **style guide page** exists (read it for prose only; see
  `design-tokens.md`).

### 2. Map the file before reading it

List the pages and each page's top-level frames first, and write `file-map.md`.
This is the coverage ledger: it fixes how many frames exist, so "I read
everything" becomes a count you can check rather than a feeling. Classify each
frame as you go — `Page--`, `Overlay--`, a components page, or scratch.

**Group the breakpoint variants.** A trailing all-digits segment is a screen
width, so `Page--Home--1440` and `Page--Home--768` are two frames of one page,
not two pages. Record them as a grid — screen down, width across — because that
shape is what makes a hole visible:

| Screen | 1440 | 768 | 390 |
|---|---|---|---|
| Home | ✓ | ✓ | ✓ |
| About | ✓ | — | ✓ |
| Equipment Detail | ✓ | — | — |

The dashes are the point. Each is a width the designer did not draw, so its
behaviour will be derived and must be reported as derived
(`css-architecture.md` §"Deriving, where the design is silent"). A missing
variant is a finding; discovering it in Phase 3 is a rebuild.

The set of widths across the whole file is the theme's breakpoint ladder — carry
it into `file-map.md` explicitly, since `theme.json` and every media query key
off it.

### 3. Per-frame trees

One `get_metadata` per top-level frame — **including every breakpoint variant**,
which is a separate frame with its own tree — each written to its own file. The
response arrives as escaped XML in a JSON envelope; decode it before grepping:

```bash
python -c "import json,html; d=json.load(open(r'<dump>',encoding='utf-8')); open(r'<out>.xml','w',encoding='utf-8').write(html.unescape(''.join(x['text'] for x in d)))"
grep -nE '^ {2,4}<' <out>.xml    # page-level structure: the pattern roots
```

Never read one of these inline. Grep by indentation for structure, and by line
range for a subtree.

### 4. Tokens

The two read-only scripts in `design-tokens.md` §"The two scripts" — variables
and styles, complete. **Not `get_variable_defs` on a layout frame**, which
reports only what that frame consumes and systematically under-reports: on the
reference file it returned six of ten font sizes and hid an entire second text
ramp that appears on no layout page at all.

### 5. Components

The third script in `design-tokens.md` §"The third script". For every component
set: its name, variant count, and each property's type and options. Then resolve
the instances actually used on the layout frames back to their definitions, and
write that map — it is what stops Phase 3 guessing which composition a shared
class payload is.

Four property types, four different answers:

- **VARIANT** — which composition this is, when one payload covers several
  (`card-simple` with `Mast Type: Logo | Text | Icon`).
- **TEXT** — the content schema. When a card becomes a query loop, these are its
  fields, named by the designer; you do not have to invent them.
- **BOOLEAN** — which parts are conditional (`Leading Icon`, `isAvailable`).
- **SLOT** — where nesting is expected.

A `State` axis (`Default | Hover | Processing`) names interaction states the
theme owes and that no page layout shows. Extract them here or they will be
missed entirely.

### 6. Motion and interactions

The current skill has historically ignored this, and a design's interactions are
part of the design. For every node with them:

- **`reactions`** — the prototype wiring: trigger, action, destination,
  transition type and duration. This is where a drawer's open behaviour, an
  accordion's toggle, and a carousel's advance are actually specified.
- **`get_motion_context`** on any animated node, for the timing and easing.

Write both to `design/motion/`, and record which pattern each belongs to.
**Implementation is not this skill's job** — hand the extracted timings to the
`web-animation-design` skill when the task comes up. Extracting them here is what
makes that possible; a motion spec that was never read cannot be handed to
anyone.

### 7. Annotations

`node.annotations` carries designer notes in four categories. Extract all of
them, keyed by node id, and resolve each to the pattern it sits in.

**Annotations are the design's second channel** — they carry everything the
geometry cannot (`../SKILL.md` §Annotations). The tags the skill reads:

| Tag | On | Carries |
|---|---|---|
| `@cpt` | a card or list root | the post type this content is, and its fields |
| `@query` | a loop wrapper | `post_type=…, tax=…, per_page=…, orderby=…` — authoritative over any inference |
| `@route` | a `Page--` frame | which template this becomes, when the shape rule is ambiguous |
| `@interaction` | any node | behaviour the frame can't show — toggle, drawer, carousel, validation |
| `@a11y` | any node | the accessible name, role or reading order the design intends |
| `@content` | any node | placeholder / TBC / "copy comes from the client" |
| `@block` | any node | build this with a specific block, usually a theme-registered one |

Write them to `annotations.json` with the tag parsed out, so Phase 3 can look up
a node's directives rather than re-reading prose.

**If the file has none, say so and ask for them.** It is the cheapest fidelity
win available — minutes of the designer's time against a whole class of
questions you would otherwise resolve by guessing or by asking one at a time,
days apart. Name the specific ones you need: every loop's `@query`, every
ambiguous `Page--`'s `@route`, and an `@interaction` on anything that moves.

## Coverage, before you move on

Phase 1 is done when all of these are true, and it is worth stating them as a
count rather than an impression:

- every top-level frame in `file-map.md` has a file in `frames/`
- every component set in the file appears in `component-sets.json`
- every variable collection and every style appears in `tokens/`
- every instance on a layout frame resolves to a main component in
  `instances.json`, or is listed as unresolved with a reason
- annotations are extracted, or their absence is reported and asked about

Report the inventory — counts, the token ramps found, the component sets and
their axes, anything unresolved — **before building from it**. This report is the
last cheap moment to discover that half the type scale was hiding on a page
nobody mentioned.
