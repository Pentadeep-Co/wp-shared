# COMMIT.md — Commit Conventions (all plugins)

This document defines how commits are structured in every Pentadeep plugin
repo (synced from wp-shared — edit it there). Follow it exactly — do not
improvise format or tone.
When the user says **"create commits"**, execute the commit sequence defined
at the end of this file. Worked examples below are drawn from true-form;
substitute the current plugin's prefix and doc set.

---

## Subject line

- **Past tense** — `added`, `removed`, `replaced`, `fixed`, `refactored`
- **Type prefix** — one of: `feat:` `fix:` `refactor:` `docs:` `chore:` `security:`
- **Breaking change** — append `!` to the type (e.g. `feat!:`, `fix!:`) when the
  change is backward-incompatible for a consumer of the plugin's public surface
  (code-first APIs, hooks/filters, block attributes/markup, stored option/meta
  shapes, REST endpoints). This denotes a SemVer
  **MAJOR** bump; add a `BREAKING CHANGE: …` line in the body describing the
  break and the migration path.
- **72 characters max**, no period at the end
- Describes what changed at the feature/module level, not at the file level

```
feat: added REST API scaffolding for trueform/v1 namespace
fix: corrected session permission check on progress endpoints
refactor: split REST/index.php into per-resource route files
docs: restructured TASKS.md phases to match BUILD_PLAN.md
chore: removed trueform_submission CPT, replaced with custom tables
security: made wildcard CORS structurally unreachable through any path
feat!: moved owner-email config out of _trueform_integrations.email
```

---

## Body

- Blank line between subject and body
- **Bullet list** — one bullet per meaningful change
- Each bullet starts with a past-tense verb
- Include file paths for non-obvious locations
- Explain **why** when the reason is not obvious from the diff — omit when it is
- Do not summarise what the next step is
- Do not reference the conversation, approval workflow, or task numbers

```
- removed allowedBlocks and InnerBlocks from trueform/form block.json —
  form is now a reference block; structure lives in the CPT, not the page
- replaced $content rendering in render.php with WP_Block instantiation
  to correctly thread trueform/formId context to child blocks
- added silent empty-string return when no CPT entry exists for the formId
```

---

## Footer

- **Co-authored line** when Claude wrote or significantly co-wrote the commit,
  naming the current model, e.g.:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- **Phase reference** when the commit completes or advances a build plan phase:
  `Phase 4 complete` or `Advances Phase 3 correctives`
- No issue or ticket references unless a tracker is adopted later

---

## What to omit

- No "this commit…" filler
- No trailing summary of what comes next
- No re-stating what is already obvious from the diff
- No references to the conversation, approvals, or task IDs

---

## Granularity

- **One commit per approved task** — never batch multiple distinct tasks
- Exception: a trivial follow-up to the immediately preceding commit (a typo
  fix, a missing semicolon) may be included in that commit rather than its own

---

## Worked examples

### feat — new capability added

```
feat: added trueform/form-step editor with stepName validation

- added TextControl in InspectorControls for stepName attribute
- normalised comparison to lowercase to make duplicate detection
  case-insensitive
- validation notice only shown when stepName is non-empty and a
  sibling step already uses the same name
```

### fix — correcting existing behaviour

```
fix: threaded formId context through do_blocks() call in render.php

- replaced do_blocks() with per-block WP_Block instantiation so
  trueform/formId context reaches child blocks (input, button, etc.)
- trueform/input uses this context for unique field ID generation;
  without it, IDs collided when two forms appeared on the same page
```

### refactor — restructuring without behaviour change

```
refactor: split REST/index.php into per-resource route files

- created helpers.php for shared permission callbacks, sanitisers,
  and form lookup/shaping functions
- created cors.php for the rest_pre_serve_request CORS filter
- created routes/forms.php, routes/submit.php, routes/progress.php,
  routes/insights.php — each owns its own registration + callbacks
- index.php is now a thin orchestrator: requires files, calls
  registration functions
```

### docs — documentation only

```
docs: updated TASKS.md phases to reflect reference block architecture

- marked trueform_submission CPT task as replaced by custom tables
- added corrective tasks to Phase 2 and Phase 3 for reference block
  conversion
- inserted Phase 5 (Plugin Admin: Form Editor) as critical-path phase
  before Frontend Runtime
- renumbered Security → 6, Frontend Runtime → 7, Full SPA → 8
```

### chore — housekeeping, no behaviour change

```
chore: removed trueform_submission CPT from CPT/index.php

- registration block deleted; replaced by wp_trueform_submissions and
  wp_trueform_submission_fields tables created via dbDelta on activation
```

---

## Commit sequence ("create commits")

When the user says **"create commits"**, execute the following steps in order.
Present the proposed commit messages for approval (step 3) and wait for the
user's go-ahead before committing; do not otherwise pause or improvise.

1. **Inspect state**
   Run `git status` and `git diff` (staged + unstaged). Run
   `git log --oneline -8` to confirm the recent commit style matches this file.

2. **Group changes by task**
   Map the changed files to the approved tasks they belong to. Each approved
   task becomes one commit. If files span multiple tasks, stage and commit
   them separately. If a change is not traceable to an approved task, flag it
   before committing.

3. **Present the commit plan for approval**
   Before staging anything, list every planned commit — its full subject line
   and body bullets, grouped by task and in order — and wait for the user to
   approve or adjust. Do not stage or commit until the user has approved the
   messages.

4. **Stage and commit each group**
   For each approved group, stage only the files belonging to that task, then
   commit following the format above. Use a heredoc to pass the message to
   avoid shell quoting issues.

5. **Report**
   After all commits are created, output a compact list:
   `{short hash} {subject}` — one line per commit. No further commentary.
