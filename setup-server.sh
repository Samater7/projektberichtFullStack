#!/bin/bash
# setup-server.sh: Provisioniert den Raspberry Pi für das LLM-Projekt

# 1. Sicherheitsnetz: Skript bricht bei Fehlern lautstark ab
set -euo pipefail

echo "=== Aktualisiere Systempakete ==="
sudo apt update
sudo apt install -y git python3 python3-venv curl

echo "=== Prüfe und installiere Ollama ==="
# Wir prüfen, ob der Befehl 'ollama' schon existiert (Idempotenz)
if ! command -v ollama >/dev/null 2>&1; then
    echo "Ollama wird installiert..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "Ollama ist bereits installiert. Überspringe..."
fi

echo "=== Prüfe und installiere Cloudflared ==="
if ! command -v cloudflared >/dev/null 2>&1; then
    echo "Cloudflared wird heruntergeladen und installiert (ARM64)..."
    # Lädt das Paket für 64-Bit ARM Prozessoren (Raspberry Pi 4/5 mit 64-bit OS) herunter
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
    sudo dpkg -i cloudflared.deb
    rm cloudflared.deb
else
    echo "Cloudflared ist bereits installiert. Überspringe..."
fi

echo "=== Setup erfolgreich abgeschlossen! ==="
