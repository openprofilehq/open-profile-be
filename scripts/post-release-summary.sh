#!/usr/bin/env bash
set -euo pipefail

SUMMARY_FILE="${1:?Usage: $0 <summary-file> <pr-number> <base-branch>}"
PR_NUMBER="${2:?}"
BASE_BRANCH="${3:?}"

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is not set}"

echo "Posting summary for PR #$PR_NUMBER on $BASE_BRANCH"

[ -f "$SUMMARY_FILE" ] || { echo "Error: summary file not found: $SUMMARY_FILE"; exit 1; }

SUMMARY=$(cat "$SUMMARY_FILE")

if [ "$BASE_BRANCH" = "production" ]; then
  PROD_NOTES="## Production Release Notes"
  if echo "$SUMMARY" | grep -q '## Database Changes'; then
    PROD_NOTES="$PROD_NOTES
- Migration changes above reviewed"
  fi
  if echo "$SUMMARY" | grep -q '## Infrastructure Changes'; then
    PROD_NOTES="$PROD_NOTES
- Infrastructure changes above verified"
  fi
  if echo "$SUMMARY" | grep -q 'Auth module'; then
    PROD_NOTES="$PROD_NOTES
- Auth / security changes above reviewed"
  fi
  if echo "$SUMMARY" | grep -q 'Files were deleted'; then
    PROD_NOTES="$PROD_NOTES
- Rollback plan in place (files deleted)"
  fi
  if [ "$PROD_NOTES" = "## Production Release Notes" ]; then
    PROD_NOTES="$PROD_NOTES
- No significant risks detected"
  fi
  SUMMARY="$SUMMARY

$PROD_NOTES"
fi

BODY="$SUMMARY

<!-- release-summary-automation -->"

API="https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments"

EXISTING=""
PAGE=1
while : ; do
  RESPONSE=$(curl -sf -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$API?per_page=100&page=$PAGE" 2>&1) || {
    echo "Error: Failed to fetch comments (page $PAGE): $RESPONSE"
    exit 1
  }

  FOUND=$(echo "$RESPONSE" | jq -r '
    first(
      .[] | select(
        (.user.login == "github-actions[bot]")
        and (.body | contains("release-summary-automation"))
      ) | .id
    ) // ""
  ' 2>/dev/null) || {
    echo "Error: Failed to parse comments response with jq (page $PAGE)"
    exit 1
  }

  if [ -n "$FOUND" ]; then
    EXISTING="$FOUND"
    break
  fi

  COUNT=$(echo "$RESPONSE" | jq 'length' 2>/dev/null) || {
    echo "Error: Failed to parse pagination response with jq (page $PAGE)"
    exit 1
  }
  [ "$COUNT" -lt 100 ] && break
  PAGE=$((PAGE + 1))
done

if [ -n "$EXISTING" ]; then
  echo "Updating comment $EXISTING..."
  curl -sf -X PATCH -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg body "$BODY" '{body: $body}')" \
    "$API/$EXISTING" > /dev/null || {
    echo "Error: Failed to update comment"
    exit 1
  }
  echo "Updated comment $EXISTING"
else
  echo "Creating new comment..."
  curl -sf -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg body "$BODY" '{body: $body}')" \
    "$API" > /dev/null || {
    echo "Error: Failed to create comment"
    exit 1
  }
  echo "Created new comment"
fi
