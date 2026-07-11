#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 GeniusLv2006
# SPDX-License-Identifier: MPL-2.0

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-$ROOT_DIR/public/videos/hdr-primer.mp4}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to regenerate the HDR primer" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=white:s=3840x2160:r=24:d=1" \
  -vf "format=yuv420p10le" \
  -c:v libx265 -preset medium -profile:v main10 -tag:v hvc1 \
  -x265-params "repeat-headers=1:colorprim=9:transfer=16:colormatrix=9:range=limited" \
  -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc -color_range tv \
  -movflags +faststart -an "$OUTPUT"

echo "Generated $OUTPUT"
