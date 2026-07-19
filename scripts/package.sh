#!/usr/bin/env bash
# Build the Chrome Web Store upload zip (whitelist only).
# Usage:  bash scripts/package.sh
# Output: dist/commentbot-<version>.zip  (version read from manifest.json)
set -euo pipefail

cd "$(dirname "$0")/.."

# Only these files/dirs belong in the uploaded package. Everything else
# (README, LICENSE, assets/, dist/, docs, .git, .claude, scripts, PRIVACY.md) is excluded.
include=(
  manifest.json
  background.js
  content.js
  providers.js
  popup.html
  popup.css
  popup.js
  inject_twitter.js
  icons
)

for item in "${include[@]}"; do
  [ -e "$item" ] || { echo "Missing required file/dir: $item" >&2; exit 1; }
done

# Read "version": "x.y.z" from manifest.json (portable; no node/jq required).
version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[ -n "$version" ] || { echo 'Could not read version from manifest.json' >&2; exit 1; }

mkdir -p dist
out="dist/commentbot-$version.zip"
rm -f "$out"

zip -r "$out" "${include[@]}" >/dev/null

echo "Built $out"
echo 'Contents:'
unzip -l "$out"
