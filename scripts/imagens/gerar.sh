#!/bin/bash
# Gera as imagens do site a partir dos HTML desta pasta, usando o Chrome sem janela.
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=4000 --window-size=1200,630 --screenshot="$PWD/../../public/og-image.png" "file://$PWD/compartilhar.html"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=2000 --window-size=180,180 --screenshot="$PWD/../../public/apple-touch-icon.png" "file://$PWD/icone.html"
echo "Imagens geradas em public/."
