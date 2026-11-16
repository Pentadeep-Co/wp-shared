# CONVENTIONS.md — every Pentadeep WordPress plugin repo

Synced from `Pentadeep-Co/wp-shared` by `pnpm sync-agent-files`. Edit it there,
not here. It covers what applies to **every** plugin repo; the repo's own
`CLAUDE.md` describes this plugin and wins wherever the two conflict.

## The instruction layers (precedence: bottom wins)

| Layer | Location | Role |
| --- | --- | --- |
| Skills | `.claude/skills/wp-plugin-development`, `.claude/skills/wp-block-development` | General WordPress how-to: hooks, lifecycle, block.json, security baseline, debugging. Plugin-agnostic. |
| This file | `.claude/instructions/CONVENTIONS.md` | Conventions, tooling and release flow shared by every plugin repo. |
| Plugin instructions | `CLAUDE.md` (repo root) and `.claudecode/*.md` | **Authoritative** for this plugin: architecture rules, naming, security, doc map. |

Above all three sit the plugin's **requirement documents** in `.docs/` (PRD,
feature, UX specs) — the canonical definition of the product. `CLAUDE.md` and
`.claudecode/` are *derived from* them, and may run ahead of them where
decisions were made during the build: a disagreement is resolved by whether
the divergence is flagged (below), not automatically in the requirement doc's
favour.

## Workflow: propose first, edit only on approval

For **every** task: present the intended approach — what will change, which
files, and why — and **wait for the user's explicit approval before editing**
anything in the working tree.

- Reading, searching, read-only commands and analysis need no approval.
- Approval is an explicit go-ahead ("approved", "go ahead", "yes") on the
  presented approach. If the reply changes the scope, re-present first.
- A request that is itself an explicit edit instruction still gets a brief
  statement of approach, unless the user has already specified it exactly.
- Commits follow `.claude/instructions/COMMIT.md`, which separately gates them
  on message approval (the "create commits" sequence).

## The workspace

Every repo is cloned side by side; tools find each other by these paths:

```
wordpress/
  wp-shared/                 shared tooling, presets, contracts, agent files
  wp-plugins/<slug>/         one repo per plugin (GitHub: Pentadeep-Co/wp-<slug>)
  wp-themes/<slug>/          one repo per theme  (GitHub: Pentadeep-Co/<slug>)
  wp-sites/                  site manifests and the deploy
  wp-local-instance/<site>/  Local's WordPress sites
```

Local sites load a plugin through a link to its repo's `plugin/` folder
(`pnpm link-site <site>`). Switching branches in one repo changes only that
plugin on the site.

## Conventions

- **pnpm only** (`node >= 22`; the repo pins its pnpm in `packageManager`).
  Never npm or yarn. Commit `pnpm-lock.yaml`: CI installs with
  `--frozen-lockfile`.
- **Two directories:**
  - `src/` — TypeScript/React build source. Never shipped or zipped.
  - `plugin/` — the shipping directory: PHP, `block.json`, built assets
    (`build/` outputs are gitignored). The local-dev link target.
- **TypeScript strict**, with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess` (`@pentadeep/wp-build/tsconfig.plugin.json`). Fix
  type errors; never loosen the flags.
- **Shared code only through wp-shared** — `@pentadeep/wp-build` (tooling,
  presets) and `@pentadeep/wp-contracts` (other plugins' browser API types),
  installed from a wp-shared tag. Never copy another plugin's code in.
- **Forms are TrueForm.** Every Pentadeep form is built with TrueForm, so a
  plugin that collects input from visitors never ships its own form handler or
  endpoint. It publishes two filters — `<prefix>_handle_submission` (takes the
  mapped values, returns an ID or `WP_Error`) and `<prefix>_status` (null when
  off) — and TrueForm carries the integration: a per-form field mapping in its
  admin and the hand-off, in `Integrations/<name>.php`. Neither plugin calls the
  other's internals. Worked examples: `Integrations/revitrental.php`
  (synchronous, before the save) and `Integrations/webstarter-reviews.php`
  (after the save).
- **A plugin that depends on another** says so in its plugin header
  (`Requires Plugins:`) and checks the version it needs at runtime.
- **Unique prefix per plugin** (e.g. `trueform`), applied to PHP
  functions/hooks, option keys, transients, CPT slugs, REST namespaces, CSS
  classes and the version constant. Never reuse another plugin's prefix.
- **Branches:** `main` is what has been released or is about to be. Work on
  short-lived branches and merge them through PRs into `main`.
- **Versioning:** `package.json` `version` is the single source of truth. The
  PHP header and version constant are stamped from it (`pnpm stamp`). Never
  hand-edit versions in PHP. SemVer: MAJOR for a breaking change to the public
  surface (hooks/filters, code-first APIs, block attributes/markup, stored
  option/meta shapes, REST endpoints), MINOR for additions, PATCH for fixes.

## Requirement documents and the derived doc set

Documentation flows one way: **requirement documents → derived markdown → code.**

1. **`.docs/`** — the product, feature and UX requirement documents: the
   canonical source of truth. Added and versioned by humans; agents read them
   but never edit them (unless the plugin's `CLAUDE.md` names an exception).
2. **`.claudecode/`** — the working doc set derived from `.docs/`. When a new
   requirement document lands, create or update the matching files.
3. **Conflict rule:**
   - **Flagged decision** — a build decision may supersede the requirement doc
     when it carries an inline flag in the derived doc (e.g. *"PRD note: … the
     PRD must be updated to match"*). The derived doc wins; never revert it to
     match a stale requirement doc.
   - **Unflagged divergence** — drift: the requirement document wins; fix the
     derived file. If it's unclear whether it was deliberate, ask.

## Commands (`package.json` scripts → `wp-build`)

| Command | Does |
| --- | --- |
| `pnpm build` / `pnpm dev` / `pnpm type-check` | The plugin's own build and checks. |
| `pnpm stamp` | Writes `version` into the PHP header, version constant and `readme.txt` `Stable tag:`. |
| `pnpm package` | Stamps, builds, zips `plugin/` to `dist/<slug>-v<version>.zip`. |
| `pnpm release [version]` | On a branch: bumps, stamps, commits `chore(release): <slug> v<x>`, pushes, opens the PR into `main`. |
| `pnpm link-site <site>` | Links this repo's `plugin/` into a Local site (`--replace` swaps out a copied folder). |
| `pnpm sync-agent-files` | Refreshes `.claude/` from wp-shared. |

## Releasing and deploying

`pnpm release <version>` on a branch, then review and **merge the PR into
`main`**: the shared release workflow (`.github/workflows/release.yml`, which
calls wp-shared's) tags `<slug>-v<version>`, builds, and publishes
`<slug>-v<version>.zip` as a GitHub Release. A merge that doesn't change the
version publishes nothing.

**This repo never deploys.** Sites are deployed by `wp-sites`, whose manifests
pin each plugin as `{ "github": "Pentadeep-Co/wp-<slug>", "tag": "<slug>-v<version>" }`.
To ship a release, bump its tag in the site's manifest (or re-export the site
from Local) and deploy from wp-sites.

Releases before the split (until November 2026) stay in the archived
`Pentadeep-Co/wordpress-plugins` repo, under the same tag names; existing pins
to it keep working.
