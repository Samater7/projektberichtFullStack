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

echo "=== Setting up systemd Service ==="
# Set the current directory and user to set up the systemd service correctly
CURRENT_DIR=$(pwd)
CURRENT_USER=$USER

# Create a systemd service file for the FastAPI application
# Note: This will run the FastAPI app on localhost:8000, which is then proxied by Cloudflare Tunnel.
# Using EOF to create a multi-line string for the service file.
sudo bash -c "cat > /etc/systemd/system/llm-api.service <<EOF
[Unit]
Description=Local LLM API with FastAPI
After=network.target

[Service]
User=$CURRENT_USER
WorkingDirectory=$CURRENT_DIR
EnvironmentFile=$CURRENT_DIR/.env
ExecStart=$CURRENT_DIR/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF"

# Reload systemd to recognize the new service, enable it to start on boot, and start the service (--no-pager important)
sudo systemctl daemon-reload
sudo systemctl enable llm-api
sudo systemctl restart llm-api
sudo systemctl status llm-api --no-pager


echo "=== Generating Cloudflare Tunnel Configuration ==="
CURRENT_USER=$USER
CLOUDFLARED_DIR="/home/$CURRENT_USER/.cloudflared"

# Create the .cloudflared directory if it doesn't exist
mkdir -p "$CLOUDFLARED_DIR"

# Check if the .env file exists and source it to get TUNNEL_UUID and DOMAIN_NAME
if [ -f "$(pwd)/.env" ]; then
    set -a; source "$(pwd)/.env" || true; set +a
    
    if [ -n "${TUNNEL_UUID:-}" ] && [ -n "${DOMAIN_NAME:-}" ]; then
        # Generate the config.yml file for cloudflared dynamically using the values from the .env file
        cat > "$CLOUDFLARED_DIR/config.yml" <<EOF
tunnel: $TUNNEL_UUID
credentials-file: $CLOUDFLARED_DIR/$TUNNEL_UUID.json

ingress:
  - hostname: $DOMAIN_NAME
    service: http://localhost:8000
  - service: http_status:404
EOF
        echo "config.yml successfully generated for $DOMAIN_NAME."
    else
        echo "Warning: TUNNEL_UUID or DOMAIN_NAME missing in the .env file!"
    fi
else
    echo "Warning: No .env file found. Skipping config.yml generation."
fi


echo "=== Setting up Cloudflare Tunnel as systemd Service ==="
CURRENT_USER=$USER
# Get the path to the cloudflared binary
CLOUDFLARED_PATH=$(command -v cloudflared || true)

sudo bash -c "cat > /etc/systemd/system/cloudflared.service <<EOF
[Unit]
Description=Cloudflare Tunnel for Projektbericht
After=network.target

[Service]
User=$CURRENT_USER
ExecStart=$CLOUDFLARED_PATH tunnel run projektbericht-tunnel
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF"

# Reload systemd to recognize the new service, enable it to start on boot, and start the service
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
