#!/usr/bin/env bash
# Deploy to GitHub Pages: https://daftmac.github.io/psycho-mutant-baseball/
# Builds with the Pages base path and replaces the gh-pages branch.
# (Deletes then pushes the branch — force-push is deny-listed in this repo.)
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_URL="https://github.com/Daftmac/psycho-mutant-baseball.git"
SHA=$(git rev-parse --short HEAD)

npm run build -- --base=/psycho-mutant-baseball/

DEPLOY=$(mktemp -d)
cp -R dist/. "$DEPLOY/"
cd "$DEPLOY"
git init -b gh-pages -q
git add -A
git commit -q -m "deploy $SHA"
git push "$REPO_URL" :gh-pages 2>/dev/null || true  # drop the old branch
git push "$REPO_URL" gh-pages

echo "deployed $SHA -> https://daftmac.github.io/psycho-mutant-baseball/"
