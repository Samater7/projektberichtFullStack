#!/bin/bash

# Script fails loudly on errors
set -euo pipefail

echo "=== Update System Packages ==="
sudo apt update
sudo apt install -y git python3 python3-venv curl

echo "=== Checking and Installing Ollama ==="
# Checking if Ollama is installed, if not, install it
if ! command -v ollama >/dev/null 2>&1; then
    echo "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo "=== Downloading AI Model ==="
    ollama pull llama3.2:1b
else
    echo "Ollama is already installed. Skipping..."
fi

echo "=== Checking and Installing Cloudflared ==="
if ! command -v cloudflared >/dev/null 2>&1; then
    echo "Installing Cloudflared..."
    # Install Cloudflared for ARM64 architecture
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
    sudo dpkg -i cloudflared.deb
    rm cloudflared.deb
else
    echo "Cloudflared is already installed. Skipping..."
fi

echo "=== Setting up Python Virtual Environment ==="
# Check if the .venv folder does not exist yet
if [ ! -d ".venv" ]; then
    echo "Creating new virtual environment..."
    python3 -m venv .venv
else
    echo "Virtual environment already exists."
fi

echo "=== Install Python Dependencies ==="
if [ -f "requirements.txt" ]; then
    # Activate the environment and install the packages
    source ".venv/bin/activate"
    pip install -r requirements.txt
else
    echo "Warning: No requirements.txt found!"
fi

echo "=== Setup successful! ==="
