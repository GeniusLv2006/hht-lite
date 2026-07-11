# Source provenance audit

hht-lite v6.0.0 establishes an independently maintained source and asset baseline. Historical releases and Git commits retain the license terms that applied when they were published.

## Audit method

The current frontend was compared in a temporary checkout against the `mercutiojohn/hht-web` default-branch commit `bf0823d5656f8e2bea71d3798ab3121da676466c` and its initial commit `922452cabaef767a02ed2dab23906d0f7f433a23`. The review used normalized-line comparison, lexical-token matching, function-level inspection, and SHA-256 comparison for binary assets.

Matches of five or more meaningful consecutive lines or forty or more consecutive lexical tokens were reviewed manually. Standard HTML declarations, required PWA fields, public API paths, DOM identifiers, language syntax, and ordinary CSS declarations were not treated as evidence by themselves.

The remaining threshold matches in `public/index.html` are the HTML doctype/head metadata and the project-required dialog DOM identifiers. They are conventional interoperability markup rather than retained upstream application expression. No threshold match remains in the application JavaScript, stylesheet, service worker, or manifest after remediation.

Run `python3 ../scripts/audit-provenance.py /path/to/temporary/hht-web` from this directory, or `python3 scripts/audit-provenance.py ...` from the repository root, to reproduce the default-branch comparison. Check out the historical commit in that temporary repository and run the same command for the historical comparison.

## v6.0.0 remediation

- The remaining matching installation, dialog, authentication, and request flows were independently reimplemented from the current behavior contract.
- The service worker and web app manifest were independently recreated around the current offline and installation requirements.
- Binary assets identical to historical upstream files were removed.
- The HDR brightness primer is generated from a synthetic solid-color FFmpeg source by [`scripts/generate-hdr-primer.sh`](../scripts/generate-hdr-primer.sh) and is covered by MPL-2.0.
- The existing UI design and hht-lite-specific application logic were retained where the audit found no meaningful upstream expression.

[`public/qr.min.js`](../public/qr.min.js) remains third-party software under the MIT License. Runtime npm dependencies remain under the licenses declared by their packages. See [Third-Party Notices](../THIRD_PARTY_NOTICES.md).
