#!/bin/bash
# Push to Apps Script. Requires clasp and a scriptId in .clasp.json.
set -euo pipefail
cd "$(dirname "$0")"
clasp push
echo "Pushed. To publish a new version:  clasp deploy --description 'Task Wall update'"
