# Scaffolding

Phase 0. Runs before a single Figma call, because the shape of the project
decides where every later artifact lands.

> **This phase is in flux.** The scaffolding is being reworked to remove the
> remaining friction documented in §3 — the interactive prompts — so that Phase 0
> can run end to end without handing steps back to the user. Until that lands,
> the manual paths below apply. Treat §3's constraints as current fact and §4's
> manual path as temporary.

Two jobs: **work out what kind of repo this is**, then **make sure the theme has
everything the later phases assume**. Both are read-only until you have told the
user what you intend to create.

## 1. Detect the repo shape

Check, in this order, from the working directory upward:

| Signal | Means |
|---|---|
| `wp/` + `src/` + `package.json` with `"release": { "kind": "theme" }` at the repo root | **Pentadeep theme repo** (the normal shape) — one repo per theme at `wp-themes/<slug>/`, scaffolded by `wp-build new-theme` (see §3) |
| `style.css` + `theme.json` at the repo root | **standalone theme repo** — the repo *is* the theme, with no `src/`/`wp/` split |
| `wp-content/themes/` above the working directory | you are inside a WordPress install; the theme should live outside it and be linked in |
| none of the above | **new project** — ask which shape before creating anything |

Never infer the shape from the directory name. A new Pentadeep theme is
scaffolded with `wp-build new-theme`, not by hand — a hand-built tree misses the
`@pentadeep/wp-build` wiring (`vite.config.ts`, `tsconfig.json`, the scripts and
the `release` block) and nothing can build or release it.

## 2. What must exist before Phase 1

The extraction and build phases assume all of this. Anything missing is a Phase 0
task, not something to notice halfway through building a pattern.

**Directories** — the repo-wide two-directory split (`../../../../CLAUDE.md`):

```
<repo root>/            (wp-themes/<slug>/, or a standalone repo)
  src/css/  src/ts/       build source — never shipped, never zipped
  wp/                     the shipping directory, and the link target
    assets/  includes/  parts/  patterns/  templates/
  design/                 extraction artifacts + PROJECT.md (see project-file.md)
  package.json  vite.config.ts  tsconfig.json
```

**Files the theme cannot boot without**

- `wp/style.css` with a valid header — version stamped from `package.json`, never
  hand-edited (`pnpm stamp`).
- `wp/index.php` and `wp/functions.php`.
- `wp/theme.json` — **not created by any scaffolding script.** It is the first
  build task, written from the Phase 1 token inventory (`design-tokens.md`).
- `wp/templates/index.html` — a block theme with no template directory is not
  recognised as a block theme at all.

**Conventions that must be settled before any code is written**

- **The theme prefix**, applied to PHP functions and hooks, constants, text
  domain, pattern category and slugs, and CSS custom properties
  (`pentadeeptwo` / `PENTADEEPTWO_` / `--pd-`). Unique per theme; never reuse
  another theme's. Everything downstream bakes this in, so a late change is a
  rename across every file.
- **Path constants from `get_template_directory()` / `get_template_directory_uri()`.**
  Local dev links the theme in from outside the web root, so a physical path
  resolves to the wrong place or to nothing.
- **The branch** — a short-lived branch off `main`, merged back by PR (there are
  no long-lived theme branches).

**The local WordPress instance.** Hard rule 4 is not satisfiable without one:
the theme must be linked into a running install (`pnpm link-site <local-site>`) you can load in a browser. Set

```php
define( 'WP_DEVELOPMENT_MODE', 'theme' );   // wp-config.php
```

or WordPress caches the `patterns/` directory scan against the theme version and
your new patterns will not appear, which reads exactly like a markup bug.

## 3. The scripts

Scaffolding comes from `@pentadeep/wp-build` (the `wp-shared` repo), which is
**authoritative here**. The skill references it rather than shipping copies, so
there is one source of truth to maintain:

| Command | Does |
|---|---|
| `wp-build new-theme <slug>` | scaffolds `wp-themes/<slug>/` as a new git repo on `main`: the directory tree, `package.json` (scripts + `release` block), `vite.config.ts`, `tsconfig.json`, `.gitignore`, `wp/style.css`, empty `functions.php`/`index.php`/`main.css`/`main.ts`. Then, in the new repo: `pnpm install`, `pnpm sync-agent-files` |
| `pnpm link-site <local-site>` | links `wp/` into the Local site's `wp-content/themes/` as a junction — no admin rights; `--replace` swaps out a copied folder |
| `@pentadeep/wp-build/scripts/theme/new-theme-file.ps1` | run from the theme repo root; creates theme files and adds the matching `@import` to `main.css` / `main.ts` |

**Two constraints that change how Phase 0 runs:**

1. **`new-theme-file.ps1` is interactive** — it prompts in a loop, so it cannot
   be driven from a non-interactive shell. Create files directly instead, and
   **add the `@import` to `main.css` in the same step**. That import is the thing
   most often forgotten: a pattern stylesheet that is never imported produces a
   completely unstyled section and no error anywhere.
2. **What `new-theme` does not create**: `theme.json`, `CLAUDE.md`, the theme's
   `.claude/*.md` doc set, `verify.config.ts`, and the GitHub repo
   (`Pentadeep-Co/<slug>`). Add those as Phase 0 tasks (deploys are configured
   in the `wp-sites` repo, not here).

## 4. Standalone repos

Same two-directory split, fewer moving parts. What changes:

- No `@pentadeep/wp-build` dependency; `vite.config.ts` carries its own config
  rather than `getBaseConfig( import.meta.dirname )`, and there is no
  `pnpm link-site` / `pnpm release`.
- Use the repo's own branch and release conventions.
- The link still applies: `wp/` → `wp-content/themes/<name>/`.

`wp-build new-theme` only creates Pentadeep theme repos under `wp-themes/`, so
for a standalone repo, scaffold the tree directly and create the link (a
directory junction) as its own step.

## 5. When the project already exists

The common case. Do not re-scaffold; **complete**. Check the §2 list, report what
is missing, and fix only that. Two things to look at specifically before deciding
the theme is ready:

- **Does `main.css` import everything in `src/css/`?** Compare the directory
  against the import list. A file present but unimported is invisible, and the
  symptom is a section that renders with no styling at all.
- **Does `theme.json` already have presets?** If so, Phase 1's token inventory is
  a reconciliation, not a first write — report tokens that exist in the theme but
  not in the design, and the reverse, before changing either.

Report the Phase 0 findings before moving on. A project that was scaffolded
months ago by a different hand is exactly where a wrong assumption survives
longest.
