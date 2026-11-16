# PROJECT.md

Phase 2. The build's durable state: what has to be built, in what order, what
each task consumes, and how anyone can tell whether it is actually done.

Lives at `design/PROJECT.md`, beside the extraction artifacts it indexes.

## What it is, and what it is not

**It is the index and the ledger.** It says a task exists, what it depends on,
which artifact holds its source, and what must be true before it can be called
done. A session that has lost all its context can read this file and resume.

**It is not a copy of the design.** Measurements, token values and node trees
live in `design/`; PROJECT.md *points at them*. The moment it starts carrying
values, there are two sources of truth for the same number and the file becomes
the stale one — it is edited by hand and they are re-extracted.

**It is not a summary of the conversation.** No approval history, no narration.
A task, its dependencies, its criteria, its status.

## Shape

````markdown
# <Theme> — build

Figma:     <url>  ·  page `<page name>`
Extracted: 2026-08-31   (re-extract if the design has moved since)
Prefix:    acme / ACME_ / --ac-
Shape:     theme repo · wp-themes/acme
Verify at: http://acme.local

## Status

| | count |
|---|---|
| accepted | 12 |
| verified — awaiting review | 2 |
| blocked | 1 |
| todo | 22 |

## Tasks

### TOK-1 — theme.json presets and utility classes
- **status:** accepted
- **depends:** —
- **source:** `design/tokens/variables.json`, `design/tokens/styles.json`
- **produces:** `wp/theme.json`, `src/css/base/`, `src/css/utilities/`
- **accept:**
  - [x] every colour, spacing step and font size in `variables.json` has a preset
  - [x] both text ramps decomposed into role + size + weight + case classes
  - [x] every `--wp--preset--*` reference resolves after kebab-casing (check 1)
  - [x] fonts self-hosted as woff2, declared in `fontFace`, every `src` resolves
- **verified:** 2026-08-29 — checks 1-3 run, all pass
- **accepted:** 2026-08-29 by the user

### PAT-7 — Section - FAQ
- **status:** blocked
- **depends:** TOK-1, PART-1
- **source:** `design/frames/page-services--1440.xml` L412-L520,
  `design/frames/page-services--768.xml` L280-L361 (no 390 frame — derived)
- **produces:** `wp/patterns/section-faq.php`, `src/css/components/_faq.css`
- **accept:**
  - [ ] measured with `get_design_context` at every width the design drew,
        before any CSS was written
  - [ ] no `wp:html`; class payloads survive verbatim into `className`
  - [ ] every class in the markup has a rule (check 2)
  - [ ] computed values match `design/measurements/section-faq.md` at 1440 and
        768, and the derived collapse holds at 390 (check 3)
  - [ ] `_faq.css` imported in `main.css`
- **verified:** —
- **accepted:** —
- **blocked:** answers for items 2-8 are missing from the design; open/close
  behaviour needs JS. Asked 2026-08-30.
````

## Task rules

**One buildable unit per task.** One pattern, one template part, one template.
Never "build the patterns" — a task you cannot finish in one sitting is a task
whose status is meaningless, and the status is the entire point.

**IDs are typed and stable:** `SCAF-`, `TOK-`, `BLK-`, `PART-`, `PAT-`, `TPL-`,
`CPT-`, `OVL-`.
Never renumber. A task that turns out to be unnecessary is closed with a reason,
not deleted — deleting it means the next session rediscovers it and asks again.

**`depends` reflects real build order,** which is narrower than it looks:

| Task type | Genuinely depends on |
|---|---|
| `TOK-` tokens | nothing |
| `BLK-` a custom block | tokens; the asset inventory it registers over |
| `CPT-` an ACF post type + fields | the component set's TEXT properties (the field list) |
| `PART-` header/footer | tokens |
| `PAT-` a pattern | tokens; the parts only if it references one; a `BLK-` or `CPT-` it uses |
| `TPL-` a template | every pattern and part it references |
| `OVL-` an overlay | tokens, and the JS/render hook — not a template |

`BLK-` covers blocks the theme registers itself — the icon block
(`block-mapping.md` §Icons) is the standing example: one block over the whole
exported icon set, with `name` / `size` / `color` attributes. A pattern that uses
one depends on it; a pattern that falls back to `core/image` records the swap as
its own `BLK-` task rather than letting the fallback harden.

`CPT-` tasks are ACF registrations. A pattern whose loop needs one is **not**
blocked by it — it ships the loop as a stub against the agreed field names
(`block-mapping.md` §"When the CPT does not exist yet") and lists the `CPT-` task
as a dependency, so the section renders empty rather than wrong.

Patterns do **not** depend on each other. That is what makes the build
parallelisable and what makes a stalled pattern (missing copy, an unresolvable
layer) cost one task instead of the whole page.

**A pattern that appears on three pages is one task.** The Phase 1 file map
already collapsed the duplicates; the task list inherits that.

**A pattern drawn at three widths is also one task.** Breakpoint variants are one
pattern file with one set of mobile-first rules — never a task per width. What
the widths change is the task's *size*: it is measured at each of them, verified
at each of them, and not `verified` until every drawn width has been diffed.

## Acceptance criteria

Criteria must be **checkable by someone who wasn't there**. "Looks like the
design" is not a criterion. Every build task carries these five, plus whatever is
specific to it:

1. **Measured before styled** — `get_design_context` was run on the root at
   every width the design drew, and transcribed into
   `design/measurements/<task>.md`, one section per width.
2. **Structure is honest** — no `wp:html`, class payloads verbatim in
   `className`, every `group<tag>` rendering with that tag, no block emitted for
   a `::pseudo` layer.
3. **Coverage** — every class in the markup has a CSS rule
   (`verification.md` check 2), and the stylesheet is imported in `main.css`.
4. **Computed values match** — diffed in a browser against the measurements at
   each drawn width (`verification.md` check 3), every mismatch fixed and
   re-checked; at underived widths, the collapse happens and nothing overflows.
5. **Reachable and announced** — tab order matches reading order, focus is
   visible, and every element has the semantics `accessibility.md` requires.

**Tick a box only after the check has actually run.** A criterion ticked on
intent is worse than an unticked one, because it stops the next session from
looking. This is the rule the whole file stands on: nothing in this stack fails
loudly, so PROJECT.md is only as good as the honesty of its checkboxes.

## The two gates

This is a **human-in-the-loop system**. Passing your own checks is necessary and
not sufficient; a task reaches its terminal state only when a person has looked
at it and said so.

| Status | Means | Set by |
|---|---|---|
| `todo` | not started | — |
| `in-progress` | being built | you |
| `blocked` | cannot proceed; the reason and the date are recorded | you |
| `verified` | **gate 1** — every acceptance box is ticked, every check ran, you have re-read the design and re-diffed | you |
| `accepted` | **gate 2** — a person reviewed the built output against the design and is satisfied | the reviewer |

**`accepted` is the only terminal status. There is no `done`.** The word is
avoided deliberately: "done" is what a model says about work it has not had
reviewed.

**Gate 1 — your certification.** Claim it explicitly, in these terms: *"Checked
and re-checked against the design; checks 1-5 pass."* It is a statement about
work you actually redid, not a summary of intent. If you have not re-read the
node with `get_design_context` and re-diffed the computed values after your last
edit, the gate is not passed — the last edit is exactly where the regression
lives.

**Gate 2 — the person's review.** Hand over what they need to review quickly:
the URL, what to look at, what you know is imperfect, and any open question the
task raised. Then **stop and wait**. Do not mark it accepted yourself, do not
infer acceptance from silence or from an instruction to continue with other work,
and do not batch a page's worth of tasks into one review request — the reviewer's
attention is the scarcest input in the whole process, and a batch is where things
get waved through.

A rejection at gate 2 sends the task back to `in-progress` with the reviewer's
note recorded. That note is design intent you did not have, so it belongs in the
task, not only in the reply.

## The flag ledger

Corrections and skips accumulate here, not only in a chat message the designer
will never see:

```markdown
## Flags

### Corrections applied
| Where | Layer | Correction |
|---|---|---|
| Page--Home | `group/[.secton__content]` | typo → `.section__content` |

### Elements skipped
| Where | Layer | Why |
|---|---|---|
| Page--Contact | `Frame 188` | Figma default name, no named twin |

### Open questions
| # | Question | Asked | Answer |
|---|---|---|---|
| 1 | Equipment: CPT archive or editor page? | 2026-08-29 | — |
| 2 | Landscape card at `s`: stack or stay? | 2026-08-30 | stack |
```

Designers fix these in batches, days later, in a different session. A flag that
lives only in scrollback is a flag that gets re-derived from scratch.

## Resuming a session

Read `PROJECT.md` first, before the Figma file and before any source. Then:

1. **Verify the claims you are about to trust.** A task marked `accepted` whose
   file doesn't exist means the file was lost, not that the task is done.
   Spot-check the `produces` paths of the last few accepted tasks. Treat a
   `verified` task as unfinished work: it is waiting on a person, and the first
   thing to do is ask for that review, not to start something new.
2. **Re-check the extraction date.** If the design has moved, re-extract before
   building on Phase 1's artifacts; identity is stable, but not immortal.
3. **Take the next task whose dependencies are all accepted**, and work it end
   to end — measure, build, verify, tick, hand over for review, then move. Not markup for five patterns
   followed by CSS for five patterns: every defect in the reference build was
   found by a later pass looking again at something an earlier pass had called
   done, and batching is what makes that late pass necessary.

Update the file as you go, not at the end of the session. An interrupted session
that updated as it went loses one task; one that batched its updates loses
everything it did.
