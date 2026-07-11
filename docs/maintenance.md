# Maintenance guide

hht-lite has discontinued active maintenance. This guide documents the current repository workflow for occasional owner-led changes; it does not create a support, response, deployment, or release commitment.

## Sources of truth

- `package.json` is the only application SemVer source.
- `version.json` contains the public `vMAJOR.MINOR.PATCH` value, release date, and user-facing changes.
- `scripts/sync-version.js` synchronizes `version.json`, the service-worker cache name, and versioned static asset URLs from `package.json`.
- `data/` contains persistent SQLite data and generated secrets; it must not be committed.

The frontend has no build step. Static changes still require a version synchronization when they are part of a release so installed PWA clients receive the new assets.

## Routine checks

Run checks proportionate to the change. The complete release check is:

```bash
npm ci
npm test
npm run check-release
npm audit --omit=dev
npm run sync-version
pipx run --spec 'reuse[charset-normalizer]==6.2.0' reuse lint
git diff --check
```

`npm run sync-version` must leave the worktree unchanged after release metadata has been prepared.

## Fresh-database verification

For database initialization or migration changes, test with an isolated temporary checkout and data directory. Do not point development tests at production data.

```bash
tmpdir="$(mktemp -d)"
git clone --local . "$tmpdir/hht-lite"
cd "$tmpdir/hht-lite"
mkdir -p data
PORT=43100 \
ALLOWED_ORIGINS=https://example.com \
INIT_ADMIN_PASSWORD='temporary-test-password' \
node server.js
```

In another terminal, verify the service and schema:

```bash
curl --fail http://127.0.0.1:43100/healthz
sqlite3 "$tmpdir/hht-lite/data/hht.db" '.tables'
```

Stop the temporary process and delete the temporary directory after verification.

## Deployment and rollback

The supported maintainer deployment path is `./deploy.sh` from a clean `main` checkout whose `HEAD` matches `origin/main`. The script:

1. Builds the exact version declared in `package.json` as a self-contained image.
2. Starts a candidate with temporary data and waits for health verification.
3. Preserves the current container while starting the replacement with production data.
4. Verifies `/healthz` and `/api/version` before removing the rollback container.
5. Restores the previous container automatically if production-data verification fails.

```bash
./deploy.sh
```

To redeploy a locally available, previously verified self-contained image:

```bash
./deploy.sh --image vMAJOR.MINOR.PATCH
```

Do not recreate an existing version tag or rebuild a published version from a different commit. Prepare a new patch release instead. Image-only rollback is supported for `v5.1.0` and newer.

## Operational verification

After deployment, check the authoritative runtime state rather than relying only on the source tree:

```bash
docker ps --filter 'name=^/hht-lite$'
docker logs --tail 50 hht-lite
curl --fail http://127.0.0.1:3100/healthz
curl --fail http://127.0.0.1:3100/api/version
```

Also verify the public HTTPS application, service worker, recent logs, container restart count, and the versioned static assets affected by the release.

See the [release process](releasing.md) for branch, pull-request, tag, and GitHub Release rules. Self-hosting and data backup instructions are in the root [README](../README.md).
