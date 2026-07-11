# Release process

`package.json` is the only source of the application SemVer. Use stable `MAJOR.MINOR.PATCH` versions without a `v` prefix. Git tags and the public version in `version.json` use the corresponding `vMAJOR.MINOR.PATCH` form.

## Version policy

- `MAJOR`: incompatible API, configuration, runtime, storage, or deployment changes.
- `MINOR`: backward-compatible features and deployment improvements.
- `PATCH`: backward-compatible bug, security, dependency, and documentation corrections.
- Documentation-only changes normally do not create an application release.

## Direct commit or pull request

Use the smallest workflow that matches the risk and impact of the change.

Commit directly to `main` when the change is clearly low risk, does not alter application or deployment behavior, and is easy to review and revert. Typical examples include prose and spelling corrections, comments, `.gitignore`, ignored local guidance, repository housekeeping, and adjustments to non-runtime collaboration policy. Use a Conventional Commit message, run checks proportionate to the change, and push `main` without creating a release.

Use a pull request when the change can affect application behavior, security or privacy boundaries, data or database handling, API or network behavior, runtime or dependencies, configuration semantics, container or deployment behavior, release artifacts, executable scripts, or meaningful CI build/test/release gates. Multi-file refactors and changes whose risk is uncertain also require a pull request.

File size alone does not decide the route: a one-line runtime or security change still requires a PR, while a small documentation or repository-hygiene change may go directly to `main`.

## Prepare a release

1. Start from an up-to-date `main` branch and create a focused branch using `type/description` or `type/scope/description`, such as `feat/self-hosting` or `fix/deploy/rollback`. Use a Conventional Commit type and lowercase kebab-case segments; do not add tool or author prefixes such as `codex/`.
2. Update the release notes in `version.json`.
3. Run `npm version <version> --no-git-tag-version`. The npm `version` lifecycle synchronizes `version.json`, the service-worker cache, and versioned static asset URLs.
4. Run the required checks:

   ```bash
   npm ci
   npm test
   npm run check-release
   npm audit --omit=dev
   npm run sync-version
   git diff --check
   ```

5. Use Conventional Commits for both commit messages and pull-request titles, push the branch, and open a pull request. PR titles must use `type(scope): description` or `type: description`; do not add tool or author branding such as `[codex]`.
6. Merge only after CI and review pass.

## Deploy and publish

1. Deploy the exact versioned image from the merged `main` commit with `./deploy.sh`. The script smoke-tests a candidate before switching and automatically restores the previous container if production-data health or endpoint verification fails.
2. Verify container health, restart count, `/healthz`, `/api/version`, the application page, and recent logs.
3. If verification succeeds, create an annotated `vMAJOR.MINOR.PATCH` tag on the merge commit and publish a GitHub Release from the same tag.
4. If deployment fails, roll back to the previously verified version. Do not create the release tag until the failed deployment has been corrected and verified.

To redeploy a previously verified self-contained image that is still present locally:

```bash
./deploy.sh --image vMAJOR.MINOR.PATCH
```

Image-only rollback is supported for `v5.1.0` and newer. Earlier images depended on host-mounted static assets and are not complete rollback units.

Release tags are immutable. Never move or recreate a published version tag; prepare a new patch version instead.
