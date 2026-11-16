# Tooling and testing

Use this file when deciding what commands to run and what “good verification” looks like.

## Pentadeep plugin toolchain (check first)

Plugins here define their own build in the plugin repo's `package.json` — usually
a custom Vite per-block build (`scripts/build.ts`), not `@wordpress/scripts`.
Use `pnpm` (never npm):

- `pnpm build` / `pnpm dev` / `pnpm type-check` from the plugin repo root
- Release/zip via the shared pipeline (`pnpm release [version]` / `pnpm package`,
  from `@pentadeep/wp-build` — see `.claude/instructions/CONVENTIONS.md`)

The generic toolchains below apply only to plugins without their own build.

## Common toolchains

- `@wordpress/scripts` for build/lint/test:
  - https://developer.wordpress.org/block-editor/reference-guides/packages/packages-scripts/
- `@wordpress/create-block` to scaffold new blocks:
  - https://developer.wordpress.org/block-editor/reference-guides/packages/packages-create-block/
- Interactivity API template for `create-block`:
  - https://www.npmjs.com/package/@wordpress/create-block-interactive-template
- `@wordpress/env` (wp-env) for local WordPress environments:
  - https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/

## Verification checklist

- `pnpm build` (or the plugin's equivalent) succeeds.
- JS lint passes (repo-specific).
- E2E tests pass if present.
- Manual: insert block, save post, reload editor, confirm no “Invalid block”.
