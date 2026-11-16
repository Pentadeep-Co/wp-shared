---
name: wp-block-development
description: "Use when developing WordPress (Gutenberg) blocks: block.json metadata, register_block_type(_from_metadata), attributes/serialization, supports, dynamic rendering (render.php/render_callback), deprecations/migrations, viewScript vs viewScriptModule, and @wordpress/scripts/@wordpress/create-block build and test workflows."
compatibility: "General WordPress guidance. Target WP/PHP versions come from each plugin's header (`Requires at least` / `Requires PHP`) — check it before assuming API availability (e.g. `viewScriptModule` needs WP 6.5+). Filesystem-based agent with bash + node."
---

# WP Block Development

## Scope: general guidance only — plugin instruction files win

This skill is **general** Gutenberg block guidance for Pentadeep plugin repos (one repo per plugin under
`wp-plugins/<slug>/`). It is not
the authority on any individual plugin's blocks.

- Each plugin is its own repo; the repo root is the plugin. Its authoritative
  instruction file is the repo-root `CLAUDE.md`, which maps out its own doc set — often
  including a dedicated blocks reference (block inventory, attributes,
  parent/child rules, markup conventions).
- **Before touching any block, read the target plugin's `CLAUDE.md` and its
  blocks reference doc. Wherever they conflict with this skill, the plugin's
  instructions win.** Plugins here may impose hard rules this skill treats as
  choices — e.g. a fixed block inventory (no new blocks without sign-off),
  dynamic-only rendering (no static `save()` markup), a single shared frontend
  runtime instead of per-block `viewScript`, or mandated CSS/naming
  conventions.
- If a plugin has no `CLAUDE.md`, fall back to the defaults in this skill.

Repo-wide conventions: **pnpm** — use `pnpm`, not npm. Plugins here
use their own build setups (e.g. custom Vite per-block builds driven by
`scripts/build.ts`), not `@wordpress/scripts`. `src/` is build source only;
`plugin/` is the shipping directory containing `block.json` files and built
assets.

## When to use

Use this skill for block work such as:

- creating a new block, or updating an existing one
- changing `block.json` (scripts/styles/supports/attributes/render/viewScriptModule)
- fixing “block invalid / not saving / attributes not persisting”
- adding dynamic rendering (`render.php` / `render_callback`)
- block deprecations and migrations (`deprecated` versions)
- build tooling for blocks (`@wordpress/scripts`, `@wordpress/create-block`, `wp-env`)

## Inputs required

- The target plugin repo (`wp-plugins/<slug>/`) and its `CLAUDE.md` + blocks reference doc.
- The block name/namespace and where it lives (path to `block.json` if known).
- Target WordPress version range from the plugin header (especially if using modules / `viewScriptModule`).

## Procedure

### 0) Locate blocks and read the plugin's instructions

1. List blocks (deterministic scan, run from repo root):
   - `node .claude/skills/wp-block-development/scripts/list_blocks.mjs`
2. Identify the block root (directory containing `block.json`) you’re changing —
   typically `plugin/blocks/<block>/` in the plugin repo.
3. Read the plugin's `CLAUDE.md` and its blocks reference doc. Its rules
   (block inventory, parent/child matrix, rendering model, naming) override
   this skill.

### 1) Create a new block (if needed)

**First check the plugin's instruction file.** Plugins here may have a fixed,
deliberate block inventory — adding a block may be an architecture change that
needs sign-off, not a routine task. If a new block is in scope:

- **Adding a block to an existing plugin in this repo:** follow the plugin's
  own structure and build discovery, not `create-block`. Typical layout: editor
  source in `src/editor/<block>/` paired with `plugin/blocks/<block>/block.json`
  (+ `render.php` if dynamic); the plugin's build script discovers the pair.
  Copy an existing block in the same plugin as the template.
- **Greenfield block/plugin with no existing tooling:** scaffold with
  `@wordpress/create-block` (see `references/creating-new-blocks.md`).

After creating:

1. Re-run the block list script and confirm the new block root.
2. Continue with the remaining steps (model choice, metadata, registration, serialization).

### 2) Ensure apiVersion 3 (WordPress 6.9+)

WordPress 6.9 enforces `apiVersion: 3` in the block.json schema. Blocks with apiVersion 2 or lower trigger console warnings when `SCRIPT_DEBUG` is enabled.

**Why this matters:**
- WordPress 7.0 will run the post editor in an iframe regardless of block apiVersion.
- apiVersion 3 ensures your block works correctly inside the iframed editor (style isolation, viewport units, media queries).

**Migration:** Changing from version 2 to 3 is usually as simple as updating the `apiVersion` field in `block.json`. However:
- Test in a local environment with the iframe editor enabled.
- Ensure any style handles are included in `block.json` (styles missing from the iframe won't apply).
- Third-party scripts attached to a specific `window` may have scoping issues.

Read:
- `references/block-json.md` (apiVersion and schema details)

### 3) Pick the right block model

The plugin's instruction file may have already made this choice for you — e.g.
mandating that **all** blocks are dynamic (`render.php`, `save()` returning
`null` or `<InnerBlocks.Content />` only). If so, that's settled; don't
introduce static-save markup.

Where the choice is genuinely open:

- **Static block** (markup saved into post content): implement `save()`; keep attributes serialization stable.
- **Dynamic block** (server-rendered): use `render` in `block.json` (or `render_callback` in PHP) and keep `save()` minimal or `null`.
- **Interactive frontend behavior**:
  - Check the plugin's frontend architecture first — some plugins ship one
    shared frontend runtime enqueued via `wp_enqueue_script` instead of
    per-block view scripts (e.g. as a CSP requirement).
  - Otherwise prefer `viewScriptModule` for modern module-based view scripts
    where supported (WP 6.5+; check the plugin's `Requires at least`).
  - If you're working primarily on `data-wp-*` directives or stores, also use `wp-interactivity-api`.

### 4) Update `block.json` safely

Make changes in the block’s `block.json`, then confirm registration matches metadata.

For field-by-field guidance, read:
- `references/block-json.md`

Common pitfalls:

- changing `name` breaks compatibility (treat it as stable API)
- changing saved markup without adding `deprecated` causes “Invalid block”
- adding attributes without defining source/serialization correctly causes “attribute not saving”

### 5) Register the block (server-side preferred)

Prefer PHP registration using metadata, especially when:

- you need dynamic rendering
- you need translations (`wp_set_script_translations`)
- you need conditional asset loading

Read and apply:
- `references/registration.md`

### 6) Implement edit/save/render patterns

Follow wrapper attribute best practices:

- Editor: `useBlockProps()`
- Static save: `useBlockProps.save()`
- Dynamic render (PHP): `get_block_wrapper_attributes()`

Read:
- `references/supports-and-wrappers.md`
- `references/dynamic-rendering.md` (if dynamic)

### 7) Inner blocks (block composition)

If your block is a “container” that nests other blocks, treat Inner Blocks as a first-class feature:

- Use `useInnerBlocksProps()` to integrate inner blocks with wrapper props.
- Keep migrations in mind if you change inner markup.

Read:
- `references/inner-blocks.md`

### 8) Attributes and serialization

Before changing attributes:

- confirm where the attribute value lives (comment delimiter vs HTML vs context)
- avoid the deprecated `meta` attribute source

Read:
- `references/attributes-and-serialization.md`

### 9) Migrations and deprecations (avoid "Invalid block")

If you change saved markup or attributes:

1. Add a `deprecated` entry (newest → oldest).
2. Provide `save` for old versions and an optional `migrate` to normalize attributes.

Read:
- `references/deprecations.md`

### 10) Tooling and verification commands

Prefer whatever the target plugin already uses — check its `package.json`
scripts first. That typically means (run from the plugin repo root):

- `pnpm build` — production build of all blocks + frontend runtime
- `pnpm dev` — watch mode
- `pnpm type-check` — strict `tsc --noEmit` (do not loosen strict flags to
  silence errors; fix the types)

Only fall back to the generic toolchain for plugins without their own build:

- `@wordpress/scripts` → run existing scripts
- `wp-env` → use for local WP + E2E

Read:
- `references/tooling-and-testing.md`

## Verification

- Block appears in inserter and inserts successfully.
- Saving + reloading does not create “Invalid block”.
- Frontend output matches expectations (static: saved markup; dynamic: server output).
- Assets load where expected (editor vs frontend).
- Run the repo’s lint/build/tests that triage recommends.

## Failure modes / debugging

If something fails, start here:

- `references/debugging.md` (common failures + fastest checks)
- `references/attributes-and-serialization.md` (attributes not saving)
- `references/deprecations.md` (invalid block after change)

## Escalation

If you’re uncertain about upstream behavior/version support, consult canonical docs first:

- WordPress Developer Resources (Block Editor Handbook, Theme Handbook, Plugin Handbook)
- Gutenberg repo docs for bleeding-edge behaviors
