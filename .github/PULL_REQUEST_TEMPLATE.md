## Summary

<!-- What does this PR do? Link the relevant issue: "Closes #123" or "Relates to #123" -->

Closes #

## Changes

<!-- Bullet points describing what changed -->

-

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / code cleanup
- [ ] Documentation
- [ ] Tests
- [ ] Chore / dependency update

## Testing

<!-- How did you verify this works? What tests were added or updated? -->

- [ ] Backend tests pass: `uv run --group dev pytest`
- [ ] Frontend tests pass: `npm run test:run`
- [ ] Frontend builds: `npm run build`
- [ ] E2E smoke passes: `npm run test:e2e`
- [ ] Manually tested the affected flows (describe below)

**Manual testing notes:**

<!-- Describe what you manually tested, including error paths if relevant -->

## Breaking changes

<!-- Does this change any API endpoints, response shapes, DB schema, or frontend props? -->

- [ ] No breaking changes
- [ ] Yes — describe below:

## Checklist

- [ ] No `snake_case` keys leak into API responses
- [ ] New models inherit `CamelModel`
- [ ] Business logic lives in `services/`, not routers
- [ ] DB access is only in `services/`
- [ ] New environment variables are documented in `backend/.env.example`
- [ ] New migrations are added to the list in `README.md`
