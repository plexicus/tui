#!/usr/bin/env bash
# Publish the files in a directory as a release asset set. Idempotent: re-running for the same tag
# reuses the release and replaces assets of the same name.
#
#   scripts/publish-release.sh forgejo <tag> <dist-dir>   token: $FORGEJO_TOKEN
#   scripts/publish-release.sh github  <tag> <dist-dir>   token: $GITHUB_RELEASE_TOKEN
#
# Never prints a token. The github target exits 0 without doing anything when the token is unset
# (the mirror may not be configured yet); the forgejo target fails without its token.
set -euo pipefail
TARGET="${1:?target: forgejo|github}"; TAG="${2:?tag}"; DIST="${3:?dist dir}"
DRY="${DRY_RUN:-0}"
case "$TARGET" in
  forgejo) API="${FORGEJO_API:-https://scm.plexicus.ai/api/v1}"; UPLOAD="$API"; REPO="${FORGEJO_REPO:-plexicus/tui}"; TOKEN="${FORGEJO_TOKEN:-}" ;;
  github)  API="https://api.github.com"; UPLOAD="https://uploads.github.com"; REPO="${GITHUB_RELEASE_REPO:-plexicus/tui}"; TOKEN="${GITHUB_RELEASE_TOKEN:-}" ;;
  *) echo "unknown target: $TARGET" >&2; exit 2 ;;
esac
if [ -z "$TOKEN" ]; then
  if [ "$TARGET" = github ]; then echo "GITHUB_RELEASE_TOKEN (repo secret GH_RELEASE_TOKEN) not set: skipping the GitHub release"; exit 0; fi
  echo "FORGEJO_TOKEN not set" >&2; exit 1
fi
FILES=("$DIST"/plexicus-* "$DIST"/SHA256SUMS)
for f in "${FILES[@]}"; do [ -f "$f" ] || { echo "missing asset: $f" >&2; exit 1; }; done
PRE=false; case "$TAG" in *-*) PRE=true ;; esac
NOTES="Release $TAG. Verify with SHA256SUMS."
if PREV=$(git describe --tags --abbrev=0 "$TAG^" 2>/dev/null); then
  NOTES="$(git log --pretty='- %s (%h)' "$PREV..$TAG" | head -60)"
fi
if [ "$DRY" = 1 ]; then
  echo "DRY RUN: would publish $TAG (prerelease=$PRE) to $TARGET $REPO with:"; printf '  %s\n' "${FILES[@]}"; exit 0
fi
hdr=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/json")
[ "$TARGET" = forgejo ] && hdr=(-H "Authorization: token $TOKEN" -H "Accept: application/json")
rel="$(curl -sS "${hdr[@]}" "$API/repos/$REPO/releases/tags/$TAG" -w '\n%{http_code}')"
code="${rel##*$'\n'}"; body="${rel%$'\n'*}"
if [ "$code" = 200 ]; then
  ID="$(printf '%s' "$body" | jq -r .id)"
else
  payload="$(jq -n --arg t "$TAG" --arg n "$TAG" --arg b "$NOTES" --argjson p "$PRE" '{tag_name:$t,name:$n,body:$b,draft:false,prerelease:$p}')"
  ID="$(curl -sS --fail-with-body "${hdr[@]}" -H 'Content-Type: application/json' -X POST "$API/repos/$REPO/releases" -d "$payload" | jq -r .id)"
fi
[ -n "$ID" ] && [ "$ID" != null ] || { echo "could not resolve release id" >&2; exit 1; }
echo "release id: $ID ($TARGET $REPO $TAG)"
existing="$(curl -sS "${hdr[@]}" "$API/repos/$REPO/releases/$ID/assets")"
for f in "${FILES[@]}"; do
  name="$(basename "$f")"
  aid="$(printf '%s' "$existing" | jq -r --arg n "$name" '.[]? | select(.name==$n) | .id' | head -1)"
  if [ -n "$aid" ]; then curl -sS --fail-with-body "${hdr[@]}" -X DELETE "$API/repos/$REPO/releases/$ID/assets/$aid" >/dev/null; fi
  if [ "$TARGET" = forgejo ]; then
    curl -sS --fail-with-body "${hdr[@]}" -F "attachment=@$f" "$UPLOAD/repos/$REPO/releases/$ID/assets?name=$name" >/dev/null
  else
    curl -sS --fail-with-body "${hdr[@]}" -H 'Content-Type: application/octet-stream' --data-binary "@$f" "$UPLOAD/repos/$REPO/releases/$ID/assets?name=$name" >/dev/null
  fi
  echo "uploaded $name"
done
