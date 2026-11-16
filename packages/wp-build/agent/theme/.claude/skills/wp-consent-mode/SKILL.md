---
name: wp-consent-mode
description: "Implement a first-party cookie consent banner wired to Google Consent Mode v2 in a WordPress (block) theme, without a heavyweight CMP plugin. Use when adding or debugging cookie consent, an analytics consent banner, or Consent Mode signalling in a theme. Triggers on: cookie consent, consent banner, cookie banner, Consent Mode, Consent Mode v2, gtag consent, consent default, consent update, analytics_storage, ad_storage, ad_user_data, ad_personalization, gcs, G100, G101, G111, GTM, Google Tag Manager, Site Kit, GA4, Google Analytics, dataLayer, cookie policy, LiteSpeed JS defer/delay ordering, page cache consent, withdraw consent, cookie settings link."
metadata:
  short-description: First-party cookie consent banner + Google Consent Mode v2 for WordPress themes
---

# WordPress Consent Mode & Cookie Banner

A theme-native way to gate Google Analytics behind consent using **Google
Consent Mode v2**, with no CMP plugin. The tag always loads; consent controls
what it may store. Reference implementation: the `pentadeeptwo` theme
(`wp/includes/consent.php` + `src/ts/consent.ts`).

## When to use

A WordPress theme whose analytics runs through GTM/GA4 and needs a compliant
consent banner. Best fit when the site runs **analytics only** (no ad tags) —
then the banner moves a single signal and the whole thing stays small. If the
site runs ad/remarketing tags, the same shape applies but you also gate the
`ad_*` signals.

## Pick the model first

- **Consent Mode "advanced" (recommended here):** GTM/GA loads on every page;
  denied by default; sends cookieless pings until the visitor accepts, then full
  measurement. Keeps aggregate traffic shape from decliners. This is what the
  pattern below implements.
- **Prior blocking:** GTM does not load until consent. Nothing from decliners.
  Simpler to explain, weaker data. Only choose deliberately.

## Division of labour

Two pieces, and the split is the whole point:

1. **PHP prints the Consent Mode default in `<head>` before GTM.** Hook
   `wp_head` at **priority 0** so it runs ahead of the GTM snippet. Define
   `dataLayer`/`gtag`, then `gtag('consent','default', …)` with everything
   denied except `functionality_storage` and `security_storage`.
2. **JS owns the banner** — shows it only when no choice is recorded, calls
   `gtag('consent','update', …)` on accept, writes a versioned first-party
   cookie either way, and injects a persistent "Cookie settings" reopen control.

The returning-visitor **re-grant is done inline in the head script, reading the
cookie synchronously** — *not* in PHP.

## Load-bearing constraints (these are where it breaks)

- **Ordering.** The `consent default` must execute before GTM initialises. Keep
  the priority-0 script first in `<head>` source order. Async-injected GA
  scripts may *appear* above it in the live DOM — that is an injection artefact,
  not execution order. Verify on the rendered page that the consent script id
  precedes `gtm.js`.
- **Page cache safety.** If the site is cached (LiteSpeed, WP Rocket, Cloudflare
  APO…), never branch on `$_COOKIE` in PHP to decide consent state — the first
  visitor's choice gets baked into the cached HTML for everyone. Read the cookie
  in the inline JS instead. Doing it inline (not in a deferred bundle) also saves
  a returning visitor from spending their first pageview on a cookieless ping.
- **Optimizer parity.** JS optimizers that rewrite/defer/delay scripts must treat
  the consent script and the GTM snippet **identically** — exclude both or
  neither. They usually preserve relative order among what they rewrite, so
  "neither" is safe; excluding one and not the other breaks the ordering
  guarantee. (LiteSpeed rewrites inline scripts to `type="litespeed/javascript"`;
  exclude the consent script and GTM together.)
- **If GTM comes from Site Kit:** Site Kit's own Consent Mode toggle must stay
  **OFF** — it emits a competing `consent default`. Its built-in feature also
  needs the WP Consent API plugin + a CMP; this theme-native approach replaces
  both. Site Kit can stay installed for Search Console/PageSpeed; on the front
  end it only emits the GTM snippet.
- **Analytics-only sites:** deny `ad_storage` / `ad_user_data` /
  `ad_personalization` permanently; the banner moves `analytics_storage` only.
  The correct granted fingerprint is **`gcs=G101`** (ad denied, analytics
  granted), *not* G111 — G111 only appears when ad storage is also granted.

## Cookie & storage inventory

Keep a table of every cookie/storage the theme and its tags set, and **mirror it
in the public cookie policy** — the two must stay in step. Distinguish
strictly-necessary (always on) from analytics (only after consent). Note that
first-party form/session storage and any embed (e.g. a booking widget) belong in
it too.

## Verification checklist

- View source (or the served HTML): consent-default script appears **before**
  `gtm.js`.
- DevTools Network, cookies cleared: `gtm.js` loads on page load; first
  `collect` hit carries `gcs=G100`; after Accept the next carries `gcs=G101`.
- Application → Cookies: no analytics cookie before Accept; present after.
- Reject (or withdraw via the reopen control): analytics cookies are cleared,
  not just frozen — a consent update stops new writes but never removes existing
  ones, so expire them explicitly across host / dot-host / registrable parent.

## Accessibility & UX

Banner is a labelled region, **not** a focus-trapping dialog, and never a cookie
wall. Accept and Reject carry equal visual weight and neither is pre-selected —
making Reject quieter is the dark pattern regulators name, and the difference
between valid consent and none. Provide a persistent reopen control so consent
can be withdrawn as easily as given.
