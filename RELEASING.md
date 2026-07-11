# Release process

`package.json` is the only source of the application SemVer. Use stable `MAJOR.MINOR.PATCH` versions without a `v` prefix. Git tags and the public version in `version.json` use the corresponding `vMAJOR.MINOR.PATCH` form.

## Version policy

- `MAJOR`: incompatible API, configuration, runtime, storage, or deployment changes.
- `MINOR`: backward-compatible features and deployment improvements.
- `PATCH`: backward-compatible bug, security, dependency, and documentation corrections.
- Documentation-only changes normally do not create an application release.

## Prepare a release

1. Start from an up-to-date `main` branch and create a focused release branch.
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

5. Commit using Conventional Commits, push the branch, and open a pull request. Runtime, dependency, deployment, security, networking, executable-script, and release-boundary changes always require a pull request.
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
