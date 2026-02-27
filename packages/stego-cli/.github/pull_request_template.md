## Summary
- What changed and why?

## Testing
- [ ] `npm test` passes locally
- [ ] If packaging behavior changed, `npm run pack:dry-run` was verified

## Release Notes Hints
- Add a changeset file for user-facing changes: `npm run changeset`.
- Use an empty changeset (`npm run changeset -- --empty`) when no version bump is needed but CI expects a changeset record.
- The `changeset-bot` GitHub App flags PRs that are missing a needed changeset.
