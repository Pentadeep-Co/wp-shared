# CONVENTIONS.md — every Pentadeep WordPress theme repo

Synced from `Pentadeep-Co/wp-shared` by `pnpm sync-agent-files`. Edit it there,
not here. It covers what applies to **every** theme repo; the repo's own
`CLAUDE.md` describes this theme and wins wherever the two conflict.

## The instruction layers (precedence: bottom wins)

| Layer | Location | Role |
| --- | --- | --- |
| Skills | `.claude/skills/*` (e.g. `web-animation-design`, `figma-to-wordpress`) | General how-to, deliberately theme-agnostic. |
| This file | `.claude/instructions/CONVENTIONS.md` | Conventions, tooling and release flow shared by every theme repo. |
| Theme instructions | `CLAUDE.md` (repo root) and its doc map into `.claude/*.md` | **Authoritative** for this theme. |

## Workflow: propose first, edit only on approval

For **every** task: present the intended approach — what will change, which
files, and why — and **wait for explicit approval before editing** anything in
the working tree. Reading, searching and read-only commands need no approval;
investigate freely, then propose. If the reply changes scope, re-present
before editing. This complements the commit gate in
`.claude/instructions/COMMIT.md` (the "create commits" sequence).

## The workspace

Every repo is cloned side by side; tools find each other by these paths:

```
wordpress/
  wp-shared/                 shared tooling, presets, verify, agent files
  wp-plugins/<slug>/         one repo per plugin (GitHub: Pentadeep-Co/wp-<slug>)
  wp-themes/<slug>/          one repo per theme  (GitHub: Pentadeep-Co/<slug>)
  wp-themes/.env             optional: FIGMA_TOKEN shared by every theme's verify
  wp-sites/                  site manifests and the deploy
  wp-local-instance/<site>/  Local's WordPress sites
```

Local sites load a theme through a link to its repo's `wp/` folder
(`pnpm link-site <site>`). Switching branches in one repo changes only that
theme on the site.

## Conventions

- **pnpm only** (`node >= 22`; the repo pins its pnpm in `packageManager`).
  Never npm or yarn. Commit `pnpm-lock.yaml`: CI installs with
  `--frozen-lockfile`.
- **Two directories:**
  - `src/` — TypeScript/CSS build source. Never shipped or zipped.
  - `wp/` — the shipping directory: PHP, `theme.json`, templates, patterns,
    template parts, and built assets (`wp/dist/` is gitignored). The local-dev
    link target.
- **Shared config only through wp-shared.** `vite.config.ts` is
  `export default defineConfig( getBaseConfig( import.meta.dirname ) )` with
  `getBaseConfig` from `@pentadeep/wp-build/vite-theme`; `tsconfig.json`
  extends `@pentadeep/wp-build/tsconfig.theme.json`. No cross-theme imports.
- **Unique prefix per theme**, applied to PHP functions/hooks, constants, text
  domain, pattern slugs, and CSS custom properties/classes (e.g.
  `pentadeeptwo` / `PENTADEEPTWO_` / `--pd-`). Never reuse another theme's
  prefix.
- **Path constants from `get_template_directory()` / `get_template_directory_uri()`**
  — local dev links the theme from outside the web root, so never resolve to a
  physical path.
- **Asset loading is environment-switched.** The theme's
  `wp/includes/theme-assets.php` enqueues from the Vite dev server
  (`localhost:5173`) when `wp_get_environment_type()` is `local`, and otherwise
  resolves hashed filenames through `wp/dist/.vite/manifest.json`. `wp/dist/` is
  build output — never hand-edit it; run `pnpm build` after changing `src/`.
  - **Know this before you debug the wrong thing:** in a `local` environment
    with Vite *not* running, the theme enqueues a URL that 404s and the site
    renders with **no CSS at all**. Nothing errors, and it looks like a broken
    stylesheet rather than a missing process.
  - **Agents do not start the dev server.** It is a long-running process on the
    developer's machine, not a read-only command. Ask for it to be started —
    typing `! pnpm dev` runs it in the session, so its output lands in the
    conversation — and wait. The only exception is explicit approval to start
    it, given for that build.
  - **Testing on phones (home network): `pnpm dev:lan`** (`vite --mode lan`)
    instead of `pnpm dev`. The dev server listens on the network and proxies
    every non-Vite path to the site named by `WP_PROXY_TARGET` in the theme's
    `.env.lan`, rewriting that hostname and `localhost:5173` in responses to
    whatever host the browser used (`@pentadeep/wp-build/wp-proxy`). Open
    `http://<PC-IP>:5173` on the device — and on the desktop too while in this
    mode. Needs Node allowed through Windows Firewall on a network profile set
    to **Private**. A theme opts in with a `dev:lan` script and an `.env.lan`.
- **Local dev needs `define( 'WP_DEVELOPMENT_MODE', 'theme' );`** in
  `wp-config.php`, or WordPress caches the `patterns/` directory scan against the
  theme version and newly added patterns simply don't appear — which reads
  exactly like a markup bug.
- **Branches:** `main` is what has been released or is about to be. Work on
  short-lived branches and merge them through PRs into `main`.
- **Versioning:** `package.json` `version` is the single source of truth; the
  `style.css` header is stamped from it (`pnpm stamp`). Never hand-edit it.
  SemVer: **MAJOR** for breaking template/markup changes, **MINOR** for
  backward-compatible features, **PATCH** for fixes. Pre-releases use a hyphen
  (`1.1.0-beta.1`) and are published as GitHub pre-releases.

## A new theme

`pnpm exec wp-build new-theme <slug>` (from any repo with wp-build, or
`node wp-shared/packages/wp-build/bin/wp-build.cjs new-theme <slug>`)
scaffolds `wp-themes/<slug>/` as a new git repo. Then `pnpm install`,
`pnpm sync-agent-files`, write the theme's `CLAUDE.md` and `.claude/*.md` doc
set as part of the build — a stale instruction file is worse than a short
honest one — and `pnpm link-site <local-site>`. Create its GitHub repo
(`Pentadeep-Co/<slug>`) with the release workflow when it is ready to release.

## Verifying a build — `pnpm verify`

A theme's build is checked in a real browser against the local site by
`@pentadeep/wp-verify` (its `README.md` is canonical). Three kinds of check,
every one of which blocks a release:

- **rules** — every page at every width: styled, no PHP/console/network error,
  no sideways scroll, no custom property that resolves to nothing, controls
  named, ids unique
- **design** — each Figma frame's class-payload layers measured against the
  live DOM (sizing mode, padding, gap, direction, type, fill, borders), from
  specs `pnpm verify:pull` writes to `design/specs/`
- **behaviour** — the theme's scripted interactions

The theme carries `verify.config.ts` (importing from `@pentadeep/wp-verify`).
Run it before handing work over, not just before a release: **a screen is not
done until `pnpm verify` passes on it** — reading the source is not verifying
it. Submissions are answered by the runner, so a run writes nothing to the
site. Accepted differences are recorded in the config with the owner's reason.
Saved logins live in `.verify/` (gitignored, per machine).

## Commands (`package.json` scripts)

| Command | Does |
| --- | --- |
| `pnpm dev` / `pnpm dev:lan` / `pnpm build` | Vite. |
| `pnpm verify` / `pnpm verify:pull` | The browser checks / pull design specs from Figma. |
| `pnpm stamp` | Writes `version` into `style.css` (and the version constant, if any). |
| `pnpm package` | Verify gate, stamp, build, zip `wp/` to `dist/<slug>-v<version>.zip`. |
| `pnpm release [version]` | On a branch: verify gate, bump, stamp, commit `chore(release): <slug> v<x>`, push, open the PR into `main`. |
| `pnpm link-site <site>` | Links this repo's `wp/` into a Local site (`--replace` swaps out a copied folder). |
| `pnpm sync-agent-files` | Refreshes `.claude/` from wp-shared. |

## Releasing and deploying

Never hand-roll a release. `pnpm release <version>` on a branch, then merge the
PR: the shared release workflow publishes `<slug>-v<version>.zip` as a GitHub
Release. `pnpm release` and `pnpm package` run `pnpm verify` first and stop on
a failure; `--skip-verify "<reason>"` is the only way past, and the reason goes
into the release commit.

**This repo never deploys.** Sites are deployed by `wp-sites`, whose manifests
pin each site's theme as `{ "github": "Pentadeep-Co/<slug>", "tag": "<slug>-v<version>" }`.

Releases before the split (until November 2026) stay in the archived
`Pentadeep-Co/wordpress-themes` repo, under the same tag names; existing pins
to it keep working.
