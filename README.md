# wp-shared

Shared tooling for Pentadeep's WordPress work: every plugin and theme lives in
its own repo, and what they have in common lives here, installed from a git
tag of this repo.

| Package | What it is |
| --- | --- |
| `packages/wp-build` (`@pentadeep/wp-build`) | The `wp-build` command — `stamp`, `package`, `release`, `link-site`, `sync-agent-files`, `new-theme` — the Vite and TypeScript presets, the LAN dev proxy, and the shared agent files (conventions, commit format, skills) for plugin and theme repos. |
| `packages/wp-verify` (`@pentadeep/wp-verify`) | `wp-verify`: checks a theme's build on its local site in a real browser — rules, Figma design specs, behaviours. The release gate for themes. See its README. |
| `packages/wp-contracts` (`@pentadeep/wp-contracts`) | Type contracts of plugins' public browser APIs (`window.SourceCap`, `window.WebStarter`) for the plugins and themes that use them. Types only. |
| `.github/workflows/release.yml` | The release workflow every plugin and theme repo calls. |

## The workspace

```
wordpress/
  wp-shared/                 this repo
  wp-plugins/<slug>/         one repo per plugin   — GitHub Pentadeep-Co/wp-<slug>
  wp-themes/<slug>/          one repo per theme    — GitHub Pentadeep-Co/<slug>
  wp-themes/.env             optional: FIGMA_TOKEN shared by every theme's verify
  wp-sites/                  site manifests and the deploy
  wp-local-instance/<site>/  Local's WordPress sites
```

Each repo is checked out on its own branch, so switching branches in one
changes only that plugin or theme. Local sites load each one through a link to
its repo (`pnpm link-site <site>` in the repo, or
`pnpm link-site <site> <slug>…` here) — a directory junction on Windows, which
needs no admin rights.

## Using it in a repo

```jsonc
// package.json
"packageManager": "pnpm@12.4.1",
"release": { "kind": "plugin", "versionConstant": "TRUEFORM_VERSION" },   // or { "kind": "theme" }
"scripts": {
  "stamp": "wp-build stamp", "package": "wp-build package", "release": "wp-build release",
  "link-site": "wp-build link-site", "sync-agent-files": "wp-build sync-agent-files"
},
"devDependencies": {
  "@pentadeep/wp-build": "github:Pentadeep-Co/wp-shared#v1.0.0&path:/packages/wp-build"
}
```

Themes add `@pentadeep/wp-verify` (and `"verify": "wp-verify"`,
`"verify:pull": "wp-verify pull"`); a plugin or theme using another plugin's
browser API adds `@pentadeep/wp-contracts`. Every `release` field has a
default: the slug is the package name, a plugin ships `plugin/` with
`plugin/<slug>.php` as its main file, a theme ships `wp/` with `wp/style.css`.

The repo's `.github/workflows/release.yml` calls
`Pentadeep-Co/wp-shared/.github/workflows/release.yml@v<x>`.

## Releasing a plugin or theme

1. On a branch: `pnpm release <version>` — for a theme, `pnpm verify` runs
   first (`--skip-verify "<reason>"` to pass it, recorded in the commit) —
   bumps `package.json`, stamps the WordPress headers, commits
   `chore(release): <slug> v<version>`, pushes, opens a PR into `main`.
2. Merge the PR. The release workflow tags `<slug>-v<version>` and publishes
   `<slug>-v<version>.zip` as a GitHub Release. A merge that doesn't change the
   version publishes nothing.
3. To ship it, bump the tag in the site's `wp-sites` manifest and deploy from
   wp-sites. Plugin and theme repos never deploy.

Releases made before the split stay in the archived `Pentadeep-Co/wordpress-plugins`
and `Pentadeep-Co/wordpress-themes` repos under the same tag names.

## Changing wp-shared

Change it here, type-check (`pnpm type-check`), commit, and tag a new version
(`v1.1.0`; SemVer — a breaking change to a command, preset or workflow is a
MAJOR). Repos move to it deliberately: bump the tag in their `package.json`
and workflow, `pnpm install`, and `pnpm sync-agent-files` for the agent files.
Agent files are edited here only — the copies in each repo are generated.
