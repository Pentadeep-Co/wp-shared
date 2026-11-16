---
name: wp-plugin-development
description: "Use when developing WordPress plugins: architecture and hooks, activation/deactivation/uninstall, admin UI and Settings API, data storage, cron/tasks, security (nonces/capabilities/sanitization/escaping), and release packaging."
compatibility: "General WordPress guidance. Target WP/PHP versions come from each plugin's header (`Requires at least` / `Requires PHP`) — check it before assuming API availability. Filesystem-based agent with bash + node."
---

# WP Plugin Development

## Scope: general guidance only — plugin instruction files win

This skill is **general** WordPress plugin guidance for Pentadeep plugin repos (one repo per plugin under
`wp-plugins/<slug>/`). It is not
the authority on any individual plugin.

- Each plugin is its own repo; the repo root is the plugin. Its authoritative
  instruction file is the repo-root `CLAUDE.md`, which maps out its own doc set
  (architecture rules, naming conventions, security requirements, data model,
  etc.).
- **Before changing any code in a plugin, read that plugin's `CLAUDE.md` (and
  the reference docs it points to for the area you're touching). Wherever it
  conflicts with this skill, the plugin's instructions win.** This skill only
  fills the gaps the plugin docs don't cover.
- If a plugin has no `CLAUDE.md`, fall back to the defaults in this skill.

Repo-wide conventions (apply to every plugin here):

- **pnpm**; use `pnpm`, not npm. The repo-root `package.json` holds the
  plugin's build scripts; shared build/release tooling comes from
  `@pentadeep/wp-build` (the `wp-shared` repo). Commands run in the plugin
  repo with no name argument.
- Inside a plugin, `src/` is build source only — never shipped. `plugin/` is
  the shipping directory (PHP, `block.json`, built assets) and the local-dev
  link target into `wp-content/plugins/` (`pnpm link-site <local-site>`
  creates the junction).
- Releases are automated — see "Release packaging" below. Never hand-edit
  version numbers in PHP.

## When to use

Use this skill for plugin work such as:

- creating or refactoring plugin structure (bootstrap, includes, namespaces/classes)
- adding hooks/actions/filters
- activation/deactivation/uninstall behavior and migrations
- adding settings pages / options / admin UI (Settings API)
- security fixes (nonces, capabilities, sanitization/escaping, SQL safety)
- packaging a release (build artifacts, readme, assets)

## Inputs required

- The target plugin repo (`wp-plugins/<slug>/`; main file is typically `plugin/<slug>.php`).
- The plugin's `CLAUDE.md` and the reference doc for the area being changed.
- Target WordPress + PHP versions from the plugin header (affects available APIs and placeholder support in `$wpdb->prepare()`).

## Procedure

### 0) Locate the plugin and read its instructions

1. Detect plugin headers (deterministic scan, run from repo root):
   - `node .claude/skills/wp-plugin-development/scripts/detect_plugins.mjs`
2. Read the repo-root `CLAUDE.md` for the target plugin, plus the reference
   docs it names for the area you're touching. Its rules override this skill.

### 1) Follow a predictable architecture

Guidelines:

- Keep a single bootstrap (main plugin file with header).
- Avoid heavy side effects at file load time; load on hooks.
- Prefer a dedicated loader/class to register hooks.
- Keep admin-only code behind `is_admin()` (or admin hooks) to reduce frontend overhead.

See:
- `references/structure.md`

### 2) Hooks and lifecycle (activation/deactivation/uninstall)

Activation hooks are fragile; follow guardrails:

- register activation/deactivation hooks at top-level, not inside other hooks
- flush rewrite rules only when needed and only after registering CPTs/rules
- uninstall should be explicit and safe (`uninstall.php` or `register_uninstall_hook`)

See:
- `references/lifecycle.md`

### 3) Settings and admin UI

Check the plugin's `CLAUDE.md` first — plugins in this repo may deliberately
use a custom admin architecture instead of the Settings API (e.g. a React
admin SPA talking to the plugin's REST namespace, with options stored under
prefixed `wp_options` keys via dedicated helpers). If so, follow that
architecture; do not introduce Settings API pages alongside it.

For plugins without their own admin architecture, prefer the Settings API:

- `register_setting()`, `add_settings_section()`, `add_settings_field()`
- sanitize via `sanitize_callback`

See:
- `references/settings-api.md`

### 4) Security baseline (always)

Before shipping:

- Validate/sanitize input early; escape output late.
- Use nonces to prevent CSRF *and* capability checks for authorization.
- Avoid directly trusting `$_POST` / `$_GET`; use `wp_unslash()` and specific keys.
- Use `$wpdb->prepare()` for SQL; avoid building SQL with string concatenation.

See:
- `references/security.md`

### 5) Data storage, cron, migrations (if needed)

- Prefer options for small config; custom tables only if necessary.
- For cron tasks, ensure idempotency and provide manual run paths (WP-CLI or admin).
- For schema changes, write upgrade routines and store schema version.

See:
- `references/data-and-cron.md`

### 6) Release packaging

Do not hand-roll zips or edit versions in PHP. Plugins share a release
pipeline from `@pentadeep/wp-build`, documented in the release section of
`.claude/instructions/CONVENTIONS.md`:

- `pnpm release [version]` — on any branch except `main`: bump + stamp + commit + push + PR into `main`
- `pnpm stamp` / `pnpm package` — standalone stamping/zipping
- `package.json` `version` is the single source of truth; the PHP header and
  version constant are stamped from it; `.github/workflows/release.yml` tags,
  builds, and publishes on merge.

A plugin opts in via the `release` block in its `package.json`.

## Verification

- Plugin activates with no fatals/notices.
- Settings save and read correctly (capability + nonce enforced).
- Uninstall behaves per the plugin's documented policy — some plugins here
  intentionally **preserve** data on uninstall by default; check `uninstall.php`
  and the plugin docs before "fixing" that. Whatever the policy, uninstall must
  never remove data outside the plugin's own.
- Run repo lint/tests (PHPUnit/PHPCS if present) and the plugin's build/type
  checks (`pnpm build`, `pnpm type-check`) if it ships assets.

## Failure modes / debugging

- Activation hook not firing:
  - hook registered incorrectly (not in main file scope), wrong main file path, or plugin is network-activated
- Settings not saving:
  - settings not registered, wrong option group, missing capability, nonce failure
- Security regressions:
  - nonce present but missing capability checks; or sanitized input not escaped on output

See:
- `references/debugging.md`

## Escalation

For canonical detail, consult the Plugin Handbook and security guidelines before inventing patterns.
