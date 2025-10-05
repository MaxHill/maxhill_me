#!/bin/bash

# -------------------------------
# Font Optimization Script (optimized for Departure Mono + IBM Plex Mono)
# -------------------------------

# Relative folders
RAW_FOLDER="assets/fonts/raw"
OPTIMIZED_FOLDER="assets/fonts/optimized"

# Create output folder if it doesn't exist
mkdir -p "$OPTIMIZED_FOLDER"

# Unicode ranges for English + Swedish
UNICODES="U+0020-007F,U+00A0-00FF"

# Function to optimize Departure Mono (keep features)
optimize_departure() {
  local f="$1"
  local FONT_NAME=$(basename "${f%.*}")
  echo "Optimizing Departure Mono: $FONT_NAME ..."

  pyftsubset "$f" \
    --output-file="$OPTIMIZED_FOLDER/$FONT_NAME.woff2" \
    --flavor=woff2 \
    --layout-features='*' \
    --unicodes="$UNICODES" \
    --with-zopfli

  pyftsubset "$f" \
    --output-file="$OPTIMIZED_FOLDER/$FONT_NAME.woff" \
    --flavor=woff \
    --layout-features='*' \
    --unicodes="$UNICODES" \
    --with-zopfli

  echo "✅ $FONT_NAME optimized"
}

# Function to optimize IBM Plex Mono (strip extra features/tables)
optimize_plex() {
  local f="$1"
  local FONT_NAME=$(basename "${f%.*}")
  echo "Optimizing IBM Plex Mono: $FONT_NAME ..."

  pyftsubset "$f" \
    --output-file="$OPTIMIZED_FOLDER/$FONT_NAME.woff2" \
    --flavor=woff2 \
    --layout-features='' \
    --drop-tables+=DSIG,GDEF,GPOS,GSUB \
    --unicodes="$UNICODES" \
    --with-zopfli

  pyftsubset "$f" \
    --output-file="$OPTIMIZED_FOLDER/$FONT_NAME.woff" \
    --flavor=woff \
    --layout-features='' \
    --drop-tables+=DSIG,GDEF,GPOS,GSUB \
    --unicodes="$UNICODES" \
    --with-zopfli

  echo "✅ $FONT_NAME optimized"
}

# Find all fonts recursively
find "$RAW_FOLDER" -type f \( -iname "*.ttf" -o -iname "*.otf" \) | while read f; do
  # Determine font family
  if [[ "$f" == *"DepartureMono"* ]]; then
    optimize_departure "$f"
  elif [[ "$f" == *"ibm-plex-mono"* || "$f" == *"IBMPlexMono"* ]]; then
    optimize_plex "$f"
  else
    echo "Skipping unknown font: $f"
  fi
done

echo "All fonts processed!"
