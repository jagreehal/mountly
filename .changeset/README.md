# Changesets

This directory contains changeset files that describe changes to the publishable packages: `mountly`, `mountly-react`, `mountly-vue`, `mountly-svelte`, and `mountly-tailwind`.

## Creating a Changeset

When you make changes that should be published, create a changeset:

```bash
pnpm changeset
```

This will:
1. Ask which packages changed and the kind of change (major, minor, patch)
2. Ask for a summary of the changes
3. Create a changeset file in `.changeset/`

## Versioning and Publishing

The GitHub Actions workflow will automatically:
- Create a PR with version bumps when changesets are merged to `main`
- Publish to npm when the version PR is merged (using OIDC for secure publishing)

## Manual Release (if needed)

If you need to release manually:

1. **Version packages**: `pnpm version-packages` updates versions + generates changelogs.
2. **Publish**: `pnpm release` builds and publishes to npm.

Refer to `docs/release-checklist.md` for the full pre-publish checklist (naming freeze, perf claims, npm smoke test) before manual releases.

## Changeset Files

Changeset files are temporary and are deleted after versioning. They follow this format:

```
---
"mountly": minor
"mountly-react": patch
---

Description of the change
```
