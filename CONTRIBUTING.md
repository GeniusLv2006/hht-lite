# Contributing

hht-lite has discontinued active maintenance but remains available for reference, forks, and community use.

Issues and pull requests may be opened while those features remain enabled, but they may not receive a response, review, merge, release, or deployment. Opening a contribution does not create a support or maintenance commitment.

Before submitting anything publicly:

- Do not include credentials, OpenIDs, access logs, personal data, or unpatched vulnerability details.
- Keep changes focused and explain any behavior, security, deployment, or compatibility impact.
- Confirm that contributed code and assets may be distributed under MPL-2.0 and document any third-party licenses.

New original source files must include a copyright notice with the actual publication year and copyright holder, plus an SPDX license identifier near the top, using the comment syntax supported by the file:

```text
Copyright (c) YEAR COPYRIGHT-HOLDER
SPDX-License-Identifier: MPL-2.0
```

Contributors retain copyright in their contributions and should add their own copyright notice without removing existing notices. Preserve third-party copyright and license information; do not relabel third-party files as MPL-2.0. Use an adjacent `.license` file or `REUSE.toml` when a file cannot reasonably contain comments. The project does not apply MPL 2.0 Exhibit B.

Run `pipx run --spec 'reuse[charset-normalizer]==6.2.0' reuse lint` before submitting licensing or file-structure changes.

For substantial continued development, maintaining an independent fork is the recommended path.

Branch paths, commit messages, and pull-request titles use [Conventional Commits](https://www.conventionalcommits.org/). Branches use `type/description` or `type/scope/description`; branch and PR names must not include tool or author branding. Release preparation and deployment rules are documented in the [release process](docs/releasing.md).
