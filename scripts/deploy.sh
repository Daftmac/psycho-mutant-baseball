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
# clone the existing branch shallowly and commit on top — no site downtime,
# no force-push (which is deny-listed in this repo)
if git clone -q --depth 1 -b gh-pages "$REPO_URL" "$DEPLOY" 2>/dev/null; then
  find "$DEPLOY" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -r {} +
else
  cd "$DEPLOY" && git init -b gh-pages -q && cd - >/dev/null
fi
cp -R dist/. "$DEPLOY/"
touch "$DEPLOY/.nojekyll" # keep Jekyll's hands off the bundle
cd "$DEPLOY"
git add -A
git commit -q -m "deploy $SHA"
git push "$REPO_URL" gh-pages

echo "deployed $SHA -> https://daftmac.github.io/psycho-mutant-baseball/"
