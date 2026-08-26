#!/bin/bash
# Push to Apps Script, and redeploy over the SAME deployment so the web app
# URL never changes.
#
#   ./deploy.sh              push only
#   ./deploy.sh "message"    push, then redeploy with that description
#
# The deployment id lives in .clasp-deployment (gitignored). Create it once:
#   clasp deploy -d "first release"
#   clasp deployments                    # copy the AKfycb... id
#   echo "AKfycb..." > .clasp-deployment
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f Config.gs ]; then
  echo "No Config.gs — that file is gitignored, so a fresh clone has none." >&2
  echo "  cp Config.example.gs Config.gs   then fill in your lists and people." >&2
  exit 1
fi

if [ ! -f .clasp.json ]; then
  echo "No .clasp.json here. Either:" >&2
  echo "  clasp create-script --type webapp --title 'Task Wall' --rootDir .   (new project)" >&2
  echo "  clasp clone <scriptId>                                              (existing)" >&2
  exit 1
fi

echo "Pushing…"
clasp push --force

if [ $# -eq 0 ]; then
  echo "Pushed. Nothing deployed — run with a message to publish:  ./deploy.sh \"what changed\""
  exit 0
fi

if [ -f .clasp-deployment ]; then
  ID="$(tr -d '[:space:]' < .clasp-deployment)"
  echo "Redeploying over $ID …"
  clasp deploy -i "$ID" -d "$1"
  echo
  echo "Live at: https://script.google.com/macros/s/$ID/exec"
else
  echo "No .clasp-deployment file — creating a NEW deployment." >&2
  echo "Save its id into .clasp-deployment so future runs reuse the same URL." >&2
  clasp deploy -d "$1"
  echo
  echo "Now run:  clasp deployments    and save the id:" >&2
  echo "          echo '<AKfycb…>' > .clasp-deployment" >&2
fi
