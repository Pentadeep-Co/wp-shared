# Name grammar — edge cases

`../SKILL.md` carries the grammar itself: the segment shapes, the four
structural wrappers, the element hints, the class payload. This file is what to
do when a name doesn't obey it, which in a real file is a few dozen layers per
page.

The dividing line is whether the name is **recoverable by rule** or needs a
**judgement call about what the designer meant**. Recover the first kind; skip
the second and flag it (hard rule 2). The cost asymmetry is the whole reason for
the split: a missing element that is reported gets fixed in Figma in a minute; a
guessed one survives to production and nobody knows it was invented.

## Recoverable — fix, and note it

| Symptom | Example (real) | Do |
|---|---|---|
| Unclosed / doubled bracket | `group/[.content__text-stack`, `h3/[.heading.fw-semi-bold]]`, `h4/[.text.text--medium.fw-medium].fw-medium]` | Parse leniently: take the classes between the first `[` and the last `]`, dedupe. |
| Wrong separator | `span-[.text.text--xsmall.fw-regular]` | Treat `-` before `[` as `/`. |
| Typo in a class | `.section__hading`, `.secton__content`, `.fw-regula`, `.price_value` | Correct to the dominant spelling **in code**, and flag it so the designer can fix Figma. Do not ship two spellings. |
| Two spellings of one utility | `.upper-case` and `.uppercase` | Pick one (the more common), use it everywhere, flag it. |
| Missing tag hint | `pattern[Section - Stats Strip]/group/[.section]` where every sibling is `group<section>` | Follow the siblings. |
| Unnamed copy of a named sibling | the 2nd and 3rd `group<article>/[.card…]` in a row where the 1st is named | Same component repeated — build it from the named one. This is duplication, not inference. |
| Word-form breakpoint suffix | `Overlay--drawer - Rental List--empty--Phone` | The breakpoint suffix should be the numeric width. Read the frame's actual width, use that, and flag it so the name can be corrected. |

The last row is the one that gets abused. It licenses copying a **sibling in the
same row with the same shape**, and nothing else. A lone unnamed frame with no
named twin is not recoverable, however obvious it looks in the screenshot.

## Not recoverable — skip, and flag

| Symptom | Example (real) |
|---|---|
| Figma default name with no named twin | `Frame 188`, `Rectangle 36`, `Vector`, `Button--primary`, bare `icon`/`image`/`span`/`group` |
| Layer named with its own copy | `N350,000/day`, `Start Date`, `CAT 320 Hydraulic Excavator` |
| Whole frame in dash-case | `Overlay--drawer…--Phone`: `drawer-header`, `empty-state-title` — the unconverted twin of a converted frame; build from the converted one and treat this as breakpoint reference only |
| Named fine, but no honest core block | see `block-mapping.md` — anything that would have wanted `wp:html` |

Do not reach for a wrapper `div` "so the layout still works". If the layout
genuinely needs a box the design didn't name, that is a finding about the design,
and it goes in the flag report where the designer can act on it.

## Deciding between them

Two questions, in order:

1. **Can I state the rule I applied, in one sentence, without the screenshot?**
   "Take the classes between the first `[` and the last `]`" is a rule. "It looks
   like a card so it's probably `.card`" is not.
2. **Would a different reader applying that rule get the same answer?** If the
   recovery depends on your reading of the render, it is a judgement call
   wearing a rule's clothes.

Anything that fails either question is unrecoverable, and unrecoverable is a
cheap outcome. It is not a failure to report thirty skipped layers on a first
pass — it is the fastest route to a design file that converts cleanly on the
second.

## The flag report

Every build message, and every PROJECT.md task that produced one, ends with the
two lists:

```
Corrections applied
  Page--About → h4/[.text.text--medium.fw-medium].fw-medium] → doubled bracket, deduped
  Page--Home → group/[.secton__content] → typo, built as .section__content

Elements skipped
  Page--Contact → Frame 188 → Figma default name, no named twin, no honest block
  Page--Home  → "CAT 320 Hydraulic Excavator" → layer named with its own copy
```

Format is `<page or pattern> → <layer name> → <reason>`. A typo fixed in code but
not flagged is a bug the designer re-introduces on the next screen, and a skipped
element that is never reported is indistinguishable from one you forgot.

These accumulate in PROJECT.md (`project-file.md` §"The flag ledger") rather than
living only in a chat message, because the designer usually fixes them in a
batch, days later, in a different session.
