---
name: wp-trueform-integration
description: "Register and wire a True Form plugin form from a WordPress theme — code-defined forms, PII flagging, owner-notification wiring, and the code-form precedence gotcha. Use when embedding, registering, or wiring a True Form form in a theme, or debugging why theme-file form edits don't take effect. Triggers on: True Form, trueform, trueform-forms directory, code-defined form, register a form, embed a form, form block, trueform_integration_config, trueform_add_form, owner notification, reply_to, form PII, encrypt form fields, audit form, form consent checkbox, source signature, form customized."
metadata:
  short-description: Integrate and wire True Form plugin forms from a WordPress theme
---

# True Form integration (theme side)

How a theme registers and wires a form built with the **True Form** plugin. The
theme defines and wires; it does not reimplement form behaviour, validation, or
submission — those are the plugin's. The plugin's own `CLAUDE.md` (in its repo)
is authoritative for block set, security model, and storage; read it first.
Reference implementation: the `pentadeeptwo` theme (`wp/trueform-forms/audit.php`
+ `wp/includes/trueform.php`).

## Registering a code-defined form

Drop a PHP file in the theme's `trueform-forms/` directory (inside the shipping
dir). True Form auto-registers it as a code-defined form, with the form id taken
from the file. The file contains the form as True Form block markup
(`wp:trueform/*`) — the block markup **is** the form structure; there is no
separate schema. Embed it on a page with the True Form block referencing that
form id.

## Flag personal data as PII

Any field capturing personal data (name, email, phone, etc.) must carry
`"pii":true` in its block attributes. That makes True Form encrypt it at rest and
decrypt only at authenticated admin display. `is_pii` is server-set from this
attribute — the client can't declare or clear it. When adding fields, flag them.

## Code-form precedence (the gotcha)

A file-registered form is re-applied on every load, so the **file is its source
of truth — until the form is edited via the plugin admin/REST**, which makes the
stored content diverge from the file's recorded signature. From then on the DB
version wins and file re-registration is a no-op. So: *editor edits win over
later theme-file edits.* If file changes aren't taking effect, the form was
customised in the editor; restoring file authority needs the plugin's resync
action, not another file edit.

## Owner-notification wiring (interim, code-first)

Until the plugin's per-form admin settings exist, wire notifications from the
theme via the plugin's **`trueform_integration_config`** filter, keyed on form
id — set the recipient(s), a `reply_to_field` (a form field whose value seeds a
validated Reply-To), and an optional subject/body template. Treat this as a shim
to remove once the plugin ships the global setting. Never put recipient config or
any credential in block attributes or `post_content` — those are public.

## Two consents — don't conflate them

A form's **consent checkbox is a form field** (often gated in the theme's JS to
disable submit until ticked) — UX-level, enforced server-side by the plugin. It
is unrelated to **cookie consent** for analytics (see the `wp-consent-mode`
skill). Keep the two separate in code and in naming.

## Decorating the runtime

The theme may add form-specific behaviour on top of the plugin runtime —
conditional field exclusivity, a custom success view, input normalisation,
re-running a submit gate on the plugin's `progress:restore` event. These
**decorate**; they never replace the plugin's validation or submission. Anything
that looks like it's re-implementing server-authoritative logic on the client is
a smell — the plugin owns that.
