#!/bin/bash

# -------------------------------
# Font Optimization Script (optimized for Departure Mono + IBM Plex Mono)
# -------------------------------

# Relative folders
RAW_FOLDER="public/fonts/raw"
OPTIMIZED_FOLDER="public/fonts/optimized"

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

# List of fonts to optimize (only the used ones)
FONTS_TO_OPTIMIZE=(
  "DepartureMono-1.500/DepartureMono-Regular.otf"
  "ibm-plex-mono/fonts/complete/otf/IBMPlexMono-Regular.otf"
  "ibm-plex-mono/fonts/complete/otf/IBMPlexMono-Medium.otf"
  "ibm-plex-mono/fonts/complete/otf/IBMPlexMono-Bold.otf"
)

for font_path in "${FONTS_TO_OPTIMIZE[@]}"; do
  f="$RAW_FOLDER/$font_path"
  if [[ -f "$f" ]]; then
    # Determine font family
    if [[ "$f" == *"DepartureMono"* ]]; then
      optimize_departure "$f"
    elif [[ "$f" == *"ibm-plex-mono"* || "$f" == *"IBMPlexMono"* ]]; then
      optimize_plex "$f"
    else
      echo "Skipping unknown font: $f"
    fi
  else
    echo "Font file not found: $f"
  fi
done

echo "All fonts processed!"
