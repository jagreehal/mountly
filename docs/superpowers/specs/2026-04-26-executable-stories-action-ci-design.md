# Executable Stories Action — CI Integration

**Date:** 2026-04-26
**Status:** Approved

## Goal

Surface Vitest and Playwright executable-stories output on pull requests by wiring `jagreehal/executable-stories-action@v1` into the existing CI workflow. Each test framework gets its own PR comment and downloadable HTML artifact.

## Context

The repo already runs the executable-stories reporters via:

- `vitest.config.ts` — writes `docs/evidence/vitest-tests.{html,md}`
- `playwright.config.ts` — writes `docs/evidence/playwright-tests.{html,md}`

The action publishes one report pair per invocation. Two reports = two invocations with distinct `comment-title` and `artifact-name` values.

## Changes

Single file: `.github/workflows/ci.yml`.

### 1. Job-scoped permissions

Add to the `build-and-test` job (the action requires `pull-requests: write` to post comments):

```yaml
permissions:
  contents: read
  pull-requests: write
```

### 2. Vitest report step

Insert after the existing `Unit tests` step:

```yaml
- name: Vitest stories report
  if: always()
  uses: jagreehal/executable-stories-action@v1
  with:
    report-dir: docs/evidence
    output-name: vitest-tests
    artifact-name: executable-stories-vitest
    comment-title: Vitest Stories
```

### 3. Playwright report step

Insert after the existing `Playwright tests` step:

```yaml
- name: Playwright stories report
  if: always()
  uses: jagreehal/executable-stories-action@v1
  with:
    report-dir: docs/evidence
    output-name: playwright-tests
    artifact-name: executable-stories-playwright
    comment-title: Playwright Stories
```

## Decisions

- **`if: always()`** — surface reports even on failing tests; that is when stories are most useful.
- **`report-dir: docs/evidence`** matches existing reporter output paths. No reporter config changes required.
- **Distinct `artifact-name`** prevents `actions/upload-artifact@v4` collisions across the two invocations.
- **Distinct `comment-title`** values produce distinct comment markers so each comment updates independently rather than overwriting the other on subsequent pushes.
- **Permissions scoped to job**, not workflow.

## Out of Scope

- No docs-site (`docs/src/content`) additions.
- No changes to `vitest.config.ts` or `playwright.config.ts`.
- No new workflow files; no changes to `release.yml`, `deploy-docs.yml`, etc.
- Reference action by GitHub ref (`jagreehal/executable-stories-action@v1`), not the local checkout path.

## Verification

- `actionlint` (or GitHub's workflow validator) accepts the modified YAML.
- A PR run produces two distinct PR comments and two artifacts named `executable-stories-vitest` and `executable-stories-playwright`.
