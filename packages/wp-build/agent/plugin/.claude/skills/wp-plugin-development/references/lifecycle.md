# Activation, deactivation, uninstall

Use this file for lifecycle changes and data cleanup.

## Activation / deactivation hooks

- `register_activation_hook( __FILE__, 'callback' )`
- `register_deactivation_hook( __FILE__, 'callback' )`

Guardrails:

- These hooks must be registered at top-level (not inside other hooks).
- If you flush rewrite rules, ensure rules are registered first (often via a shared function called both on `init` and activation).

Upstream reference:

- https://developer.wordpress.org/plugins/plugin-basics/activation-deactivation-hooks/

## Uninstall

Preferred approaches:

- `uninstall.php` (runs only on uninstall)
- `register_uninstall_hook()`

Guardrails:

- Check `WP_UNINSTALL_PLUGIN` before running destructive cleanup.
- Data removal on uninstall is a **per-plugin policy decision** — Pentadeep plugins
  may intentionally preserve data by default (opt-in wipe).
  Check the plugin's `uninstall.php` and instruction file before changing
  cleanup behavior in either direction.

Upstream reference:

- https://developer.wordpress.org/plugins/plugin-basics/uninstall-methods/

