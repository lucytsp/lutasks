#!/bin/bash
# Build preview.html (an Artifact-ready fragment) from index.html.
# The Artifact host supplies its own <!doctype>/<html>/<head>/<body>, so the
# wrapper tags are stripped and everything inside them is kept, in order.
set -euo pipefail
cd "$(dirname "$0")/.."

sed -E \
  -e '/^<!DOCTYPE html>$/d' \
  -e '/^<html lang="en-GB">$/d' \
  -e '/^<\/html>$/d' \
  -e '/^<head>$/d' \
  -e '/^<\/head>$/d' \
  -e '/^<body>$/d' \
  -e '/^<\/body>$/d' \
  -e '/^<meta charset="utf-8">$/d' \
  -e '/^<meta name="viewport"/d' \
  index.html > preview.html

echo "preview.html built ($(wc -l < preview.html) lines)"
