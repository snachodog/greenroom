# Contributing

Thanks for taking the time to contribute.

## Before you start

- **Bug fixes and small improvements** — open a PR directly.
- **New features or significant changes** — open an issue first to discuss the approach.
- **Security issues** — see [SECURITY.md](SECURITY.md); do not open a public issue.

## Commit messages

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[optional scope]: <description>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`

Examples:
```
feat(auth): add magic link login
fix: correct typo in error message
docs: update setup instructions
```

Commits drive automated releases through semantic-release: `feat` bumps minor, `fix` and `perf` bump patch, and `!` or a `BREAKING CHANGE:` footer bumps major. Do not add co-author or sign-off trailers.

## Branch naming

```
<type>/<short-description>
```

Examples: `feat/magic-link-auth`, `fix/login-redirect`, `docs/setup-guide`

## Pull requests

1. Fork the repo and create your branch from `main`
2. Make your changes with conventional commits
3. Ensure tests pass (if applicable)
4. Open a PR — fill out the template completely
5. A maintainer will review within a reasonable time

## Code style

- Follow the conventions already in the file you're editing
- Do not reformat files unrelated to your change
- Remove debug statements and commented-out code before opening a PR

## Issues

Use the issue templates. Include enough context to reproduce the problem or understand the request without follow-up questions.
