#!/usr/bin/env python3
# Copyright (c) 2026 GeniusLv2006
# SPDX-License-Identifier: MPL-2.0

"""Report review-threshold source matches against a temporary hht-web checkout."""

from __future__ import annotations

import argparse
import difflib
import re
from pathlib import Path

LINE_THRESHOLD = 5
TOKEN_THRESHOLD = 40
IGNORED_LINES = {"{", "}", "});", "</div>", "</script>", "</style>"}
COMPARISONS = (
    ("index.html", "public/index.html"),
    ("index.html", "public/app.css"),
    ("index.html", "public/app.js"),
    ("service-worker.js", "public/service-worker.js"),
    ("manifest.json", "public/manifest.json"),
)


def normalized_lines(text: str) -> list[str]:
    result = []
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line.strip())
        if line and line not in IGNORED_LINES:
            result.append(line)
    return result


def tokens(text: str) -> list[str]:
    return re.findall(r"[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|=>|&&|\|\||[^\s]", text)


def matching_blocks(left: list[str], right: list[str], threshold: int) -> list[int]:
    matcher = difflib.SequenceMatcher(None, left, right, autojunk=False)
    return [block.size for block in matcher.get_matching_blocks() if block.size >= threshold]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("upstream", type=Path, help="path to a temporary hht-web checkout")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()

    for source_name, target_name in COMPARISONS:
        source_path = args.upstream / source_name
        target_path = args.root / target_name
        if not source_path.exists():
            continue
        source = source_path.read_text(errors="replace")
        target = target_path.read_text(errors="replace")
        line_blocks = matching_blocks(normalized_lines(source), normalized_lines(target), LINE_THRESHOLD)
        token_blocks = matching_blocks(tokens(source), tokens(target), TOKEN_THRESHOLD)
        print(f"{source_name} -> {target_name}: lines={line_blocks} tokens={token_blocks}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
