# Settings API (admin options)

Use this file when adding settings pages or storing user-configurable options.

> **In Pentadeep plugin repos:** check the plugin's `CLAUDE.md` first. Some plugins
> deliberately bypass the Settings API in favor of a REST-backed admin SPA
> with options stored under prefixed keys via dedicated helpers. In that case
> follow the plugin's architecture; this file applies only where no such
> architecture exists.

Core APIs:

- `register_setting()`
- `add_settings_section()`
- `add_settings_field()`

Upstream references:

- Settings API overview: https://developer.wordpress.org/plugins/settings/settings-api/
- Register settings: https://developer.wordpress.org/plugins/settings/registration/
- Add settings fields: https://developer.wordpress.org/plugins/settings/settings-fields/

Practical guardrails:

- Use `sanitize_callback` to validate/sanitize data.
- Use capability checks (commonly `manage_options`) for settings screens and saves.
- Escape values on output (`esc_attr`, `esc_html`, etc.).

