#!/usr/bin/env bash
# Build the three release binaries and SHA256SUMS into dist/ (or $1).
# Targets match the README install matrix: macOS arm64/x64 and Linux x64. Cross-compiling
# downloads the target Bun runtime, so this needs outbound access to github.com.
set -euo pipefail
OUT="${1:-dist}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p "$OUT"
for t in darwin-arm64 darwin-x64 linux-x64; do
  bun build src/main.tsx --compile --target="bun-$t" --outfile "$OUT/plexicus-$t"
done
cd "$OUT"
if command -v sha256sum >/dev/null 2>&1; then sha256sum plexicus-* > SHA256SUMS; else shasum -a 256 plexicus-* > SHA256SUMS; fi
cat SHA256SUMS
