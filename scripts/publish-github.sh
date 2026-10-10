#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v gh >/dev/null 2>&1; then
  echo 'GitHub CLI (gh) not installed. See docs/ops/GITHUB_SETUP.md.' >&2
  exit 1
fi
gh auth status
if [ ! -d .git ]; then
  git init -b main
  git add .
  echo 'No Git commit yet. Please run git commit after reviewing files and setting your own git identity.' >&2
  exit 1
fi
if git remote get-url origin >/dev/null 2>&1; then
  echo 'origin already configured; refusing to create/push without manual review.' >&2
  exit 1
fi
# User explicitly requested a fresh repo. Publishing must happen with authenticated owner consent.
gh repo create banh-mi-cho-pos --private --source=. --remote=origin --push
