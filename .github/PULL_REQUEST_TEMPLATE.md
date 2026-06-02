## Summary

<!-- 1–3 sentences. What does this PR do? -->

## Test plan

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds cold
- [ ] If the extension's runtime behavior changes: F5 smoke + screenshot
- [ ] Updated `CHANGELOG.md` under `[Unreleased]`

## Related

<!-- Link issues, design docs, or prior PRs -->

## Checklist

- [ ] No `console.log` left in production code
- [ ] No PII / production data in tests
- [ ] If the message protocol changed, bumped `POST_MESSAGE_VERSION`
