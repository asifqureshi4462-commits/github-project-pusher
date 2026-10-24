#!/usr/bin/env bash
# Generates every Android launcher icon (normal, round, adaptive) from ONE image.
# Usage: bash scripts/make-icons.sh [resources/icon.png] [android/app/src/main/res]
set -euo pipefail

SRC="${1:-resources/icon.png}"
RES="${2:-android/app/src/main/res}"

[ -f "$SRC" ] || { echo "Icon not found: $SRC"; exit 1; }
[ -d "$RES" ] || { echo "Android res dir not found: $RES (run 'npx cap add android' first)"; exit 1; }

IM=convert
command -v magick >/dev/null 2>&1 && IM=magick

# Adaptive-icon background colour = colour of the icon's top-left area, so it blends seamlessly
BG="$($IM "$SRC" -format '#%[hex:p{6,6}]' info: | cut -c1-7)"
echo "Adaptive icon background colour: $BG"

make_density () {
  local dir="$1" legacy="$2" fg="$3"
  mkdir -p "$RES/$dir"
  # legacy square icon
  $IM "$SRC" -resize "${legacy}x${legacy}" "$RES/$dir/ic_launcher.png"
  # legacy round icon
  $IM -size "${legacy}x${legacy}" xc:none -fill white -draw "circle $((legacy/2)),$((legacy/2)) $((legacy/2)),0" "/tmp/mask_$legacy.png"
  $IM "$SRC" -resize "${legacy}x${legacy}" "/tmp/mask_$legacy.png" -alpha off -compose CopyOpacity -composite "$RES/$dir/ic_launcher_round.png"
  # adaptive foreground: full-bleed icon (Android shows the centre 66% inside the launcher shape)
  $IM "$SRC" -resize "${fg}x${fg}" "$RES/$dir/ic_launcher_foreground.png"
}

make_density mipmap-mdpi    48  108
make_density mipmap-hdpi    72  162
make_density mipmap-xhdpi   96  216
make_density mipmap-xxhdpi  144 324
make_density mipmap-xxxhdpi 192 432

mkdir -p "$RES/values" "$RES/mipmap-anydpi-v26"
cat > "$RES/values/ic_launcher_background.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$BG</color>
</resources>
XML

for n in ic_launcher ic_launcher_round; do
cat > "$RES/mipmap-anydpi-v26/$n.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
XML
done

echo "Icons generated from $SRC"
