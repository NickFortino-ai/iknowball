#!/usr/bin/env bash
# Sync source stadium images from ~/Desktop/IKB Images/NFL Fantasy Images
# into client/public/backdrops as .webp with normalized filenames.
#
# Safety: only overwrites files that already exist in the repo. Won't
# create net-new backdrops (that would require wiring them into
# league_backdrops seeding too).
#
# Options:
#   --dry-run     Print what would happen without writing
#   --only NAME   Sync only the source file matching NAME (case-insensitive substring)
#
# Requires: cwebp (brew install webp) and sips (built into macOS).

set -euo pipefail

SRC_DIR="$HOME/Desktop/IKB Images/NFL Fantasy Images"
DST_DIR="$(cd "$(dirname "$0")/.." && pwd)/client/public/backdrops"
MAX_WIDTH=2560
QUALITY=85

DRY_RUN=0
ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --only) ONLY="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Filename transform: strip extension, lowercase, & → and, drop apostrophes,
# spaces / underscores → hyphens, strip other punctuation, prepend nfl-.
normalize() {
  local base="${1%.*}"
  base=$(echo "$base" | tr '[:upper:]' '[:lower:]')  # lowercase (portable, macOS bash 3.2 lacks ${,,})
  base=$(echo "$base" | sed 's/&/and/g')             # & → and
  base=$(echo "$base" | sed "s/'//g")                # drop apostrophes
  base=$(echo "$base" | sed 's/[ _]/-/g')            # spaces / underscores → hyphens
  base=$(echo "$base" | sed 's/[^a-z0-9-]//g')       # strip other punctuation
  echo "nfl-${base}.webp"
}

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Source folder not found: $SRC_DIR"
  exit 1
fi

converted=0
skipped=0
missing=0

for src in "$SRC_DIR"/*; do
  [[ -f "$src" ]] || continue
  fname="$(basename "$src")"
  # Skip hidden files (macOS .DS_Store etc.)
  [[ "$fname" =~ ^\. ]] && continue

  if [[ -n "$ONLY" ]]; then
    only_lc=$(echo "$ONLY" | tr '[:upper:]' '[:lower:]')
    fname_lc=$(echo "$fname" | tr '[:upper:]' '[:lower:]')
    if [[ ! "$fname_lc" =~ $only_lc ]]; then
      continue
    fi
  fi

  target="$(normalize "$fname")"
  dst="$DST_DIR/$target"

  if [[ ! -f "$dst" ]]; then
    echo "  ⚠  skip (no matching repo target): $fname → $target"
    missing=$((missing + 1))
    continue
  fi

  # Get source dims for reporting
  src_dims=$(sips -g pixelWidth -g pixelHeight "$src" 2>/dev/null | awk '/pixelWidth|pixelHeight/ {print $2}' | paste -sd 'x' -)
  src_width=$(echo "$src_dims" | cut -dx -f1)

  # Get pre-swap dims for the target
  old_dims=$(sips -g pixelWidth -g pixelHeight "$dst" 2>/dev/null | awk '/pixelWidth|pixelHeight/ {print $2}' | paste -sd 'x' -)

  # Decide whether to resize down. Anything wider than MAX_WIDTH gets
  # capped to save bundle size; below that, pass through at native res.
  resize_arg=""
  if [[ "$src_width" -gt "$MAX_WIDTH" ]]; then
    resize_arg="-resize $MAX_WIDTH 0"
  fi

  echo "→ $fname ($src_dims)  →  $target  (was $old_dims)"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    # cwebp handles most formats. For inputs that are already webp we
    # just copy (cwebp can't read webp as input).
    ext="${fname##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
    if [[ "$ext" == "webp" ]]; then
      cp "$src" "$dst"
    else
      cwebp -q "$QUALITY" $resize_arg "$src" -o "$dst" 2>/dev/null
    fi
    new_dims=$(sips -g pixelWidth -g pixelHeight "$dst" 2>/dev/null | awk '/pixelWidth|pixelHeight/ {print $2}' | paste -sd 'x' -)
    new_size=$(du -h "$dst" | cut -f1)
    echo "   ✓ wrote $new_dims ($new_size)"
    converted=$((converted + 1))
  else
    skipped=$((skipped + 1))
  fi
done

echo
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run: would sync $skipped files"
else
  echo "Synced $converted files"
fi
if [[ "$missing" -gt 0 ]]; then
  echo "Warning: $missing source files had no matching repo target (see above)"
fi
