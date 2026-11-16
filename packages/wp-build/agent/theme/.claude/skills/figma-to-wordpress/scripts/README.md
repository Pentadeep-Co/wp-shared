# Scripts

This directory is currently a pointer, not a toolbox.

## Scaffolding

The skill **references** `@pentadeep/wp-build`'s scaffolding (the `wp-shared`
repo) rather than shipping copies, so there is one source of truth:

```
wp-build new-theme <slug>                                scaffold wp-themes/<slug>/ as a new git repo
pnpm link-site <local-site>                              link wp/ into a Local site (junction, no admin)
@pentadeep/wp-build/scripts/theme/new-theme-file.ps1     create theme files, maintain main.css imports
```

`references/scaffolding.md` §3 documents what they do, what they leave for you,
and the constraint that matters when driving them from an agent:
`new-theme-file.ps1` (run from the theme repo root) is interactive and so cannot
be driven from a non-interactive shell.

These assume the Pentadeep theme repo shape (`wp-themes/<slug>/` wired to
`@pentadeep/wp-build`). For a standalone repo, `scaffolding.md` §4 describes the
manual path.

## Verification

`references/verification.md` carries its checks as inline snippets — preset
resolution, class coverage, computed-value diffing, DOM inspection. Extracting
them into runnable scripts here is the obvious next step: they are run once per
task, by hand, and a check that is tedious to run is a check that gets skipped.

Nothing has been extracted yet, deliberately — the scripts belong with the
scaffolding rewrite rather than ahead of it.
