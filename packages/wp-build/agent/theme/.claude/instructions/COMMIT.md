# COMMIT.md — Commit Conventions (all themes)

How commits are structured in every Pentadeep theme repo (synced from
wp-shared — edit it there). Follow it exactly — do not improvise format or tone. When the user says **"create commits"**, execute the
sequence at the end of this file.

The prefixes are theme-native, not the app/conventional-commits set: a theme is
*presentation* work (patterns, templates, styles, content) and *behaviour* work
(JS/PHP), and the prefixes name both. Note `style:` here means **visual/CSS**,
not the conventional-commits "code formatting" sense.

---

## Subject line

- **Scoped** — `type(<theme>): …`, where `<theme>` is the theme's slug
  (e.g. `pentadeeptwo`), even though each repo holds one theme: the history
  carried over from the monorepo is scoped, so match it. Repo/tooling changes
  may go unscoped (`chore: …`).
- **Past tense** — `added`, `removed`, `replaced`, `fixed`, `refined`.
- **72 characters max**, no trailing period.
- Describes what changed at the feature/area level, not file-by-file.

### The eight prefixes

| Prefix | For |
|---|---|
| `pattern:` | Block patterns and page sections (`wp/patterns/`) |
| `template:` | Templates and template parts (`wp/templates/`, `wp/parts/`) — FSE structure & hierarchy |
| `style:` | Visual & design-system changes — CSS, tokens, spacing, colour, layout |
| `content:` | Copy, text, legal/marketing content |
| `feat:` | Behavioural code — JS/PHP logic, interactions, plugin integrations |
| `fix:` | Bug fixes in any area (visual regression, broken link, JS error, PHP notice) |
| `chore:` | `theme.json`, enqueues/setup, assets, dependencies, tooling, releases |
| `docs:` | Documentation (`CLAUDE.md`, `.claude/*`) |

`feat:` is deliberately narrow — it's the *behavioural* slot only. Presentation
work takes a presentation prefix (`pattern`/`template`/`style`/`content`), never
`feat:`.

**Primary-area rule.** When a change spans areas, prefix by the one that led the
change, not the one with the most lines. A footer legal-links column that
touches a template part *and* its CSS is `template:` — the structure led; the CSS
served it.

```
pattern(pentadeeptwo): added the legal page pattern
template(pentadeeptwo): added the generic page fallback template
style(pentadeeptwo): refined the success-view spacing rhythm
content(pentadeeptwo): tightened the audit intro copy
feat(pentadeeptwo): added the cookie consent banner and Consent Mode v2
fix(pentadeeptwo): stopped the next-step separator emitting a stray paragraph
chore(release): pentadeeptwo v1.5.0
docs(pentadeeptwo): added the theme doc set and skills
```

### Breaking changes

Append `!` to the prefix (`template!:`, `style!:`, `feat!:`) when the change is
backward-incompatible for a live site or its customizations on update, and add a
`BREAKING CHANGE: …` body line describing the break and the migration. This is a
SemVer **MAJOR** (see below). For a theme, "breaking" means things like:

- removing or renaming a **pattern slug, template, or template part** that
  existing content/pages reference;
- removing or renaming a **`theme.json` preset/token, CSS custom property, or CSS
  class** that content, child themes, or custom CSS depend on;
- removing a **PHP hook/filter** the theme exposes, or a registered pattern
  category slug;
- anything that forces the site owner to reconfigure or re-select after update.

---

## SemVer mapping

Versions are **chosen by hand** at `pnpm release [version]` — nothing
parses commit types. This table is guidance for picking that number; the
MAJOR/MINOR/PATCH definitions are in `CONVENTIONS.md` (Versioning): MAJOR =
breaking template/markup, MINOR = backward-compatible features, PATCH = fixes.

| Prefix | Typical bump |
|---|---|
| `pattern:` | **MINOR** for a new pattern · **PATCH** for a tweak to an existing one |
| `template:` | **MINOR** for a new template/part · **PATCH** for a tweak |
| `feat:` | **MINOR** |
| `style:` | **PATCH** (MINOR only if it ships new design tokens/utilities meant as reusable API) |
| `content:` | **PATCH** |
| `fix:` | **PATCH** |
| `chore:` | **PATCH**, or no release (deps/tooling); `chore(release):` *is* the bump, not a trigger |
| `docs:` | No release (PATCH only if bundled with shippable changes) |
| any `!` / `BREAKING CHANGE:` | **MAJOR**, overriding the row above |

The split within `pattern:`/`template:` is the honest part: *adding* a
capability is MINOR, *refining* an existing one is PATCH. The prefix suggests the
default; additive-vs-refinement decides between MINOR and PATCH, and `!` forces
MAJOR.

---

## Body

- Blank line between subject and body.
- **Bullet list** — one bullet per meaningful change, each starting with a
  past-tense verb.
- Include file paths for non-obvious locations.
- Explain **why** when it isn't obvious from the diff — omit when it is.
- Do not summarise the next step, or reference the conversation, approval
  workflow, or task numbers.

```
- added wp/templates/page.html so pages without a slug-specific template
  render their content; they previously fell through to index.html, whose
  <main> carries no post-content block and rendered empty
```

---

## Footer

- **Co-authored line** when Claude wrote or significantly co-wrote the commit,
  naming the current model, e.g.:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Omit it on commits the user authored (e.g. content they wrote themselves).

---

## Granularity

- **One commit per approved task** — never batch distinct tasks.
- Exception: a trivial follow-up to the immediately preceding commit (a typo
  fix, a missing semicolon) may ride along in that commit.
- A change not traceable to an approved task is **flagged** before committing,
  not silently folded in.

---

## Commit sequence ("create commits")

1. **Inspect state** — `git status`, `git diff` (staged + unstaged), and
   `git log --oneline -8` to confirm the recent style matches this file.
2. **Group by task** — map changed files to the approved tasks they belong to;
   each task becomes one commit. Flag anything untraceable.
3. **Present the plan for approval** — list every planned commit (full subject +
   body bullets, grouped and ordered) and wait. Do not stage or commit until the
   user approves the messages.
4. **Stage and commit each group** — stage only that task's files, then commit
   using a heredoc for the message to avoid quoting issues.
5. **Report** — a compact `{short hash} {subject}` list, one line per commit.
