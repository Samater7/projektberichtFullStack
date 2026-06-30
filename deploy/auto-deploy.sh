#!/bin/bash
# Force the script to fail loudly on errors
set -euo pipefail

# Determine the directory of the script
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")

# Derive the project directory from the script directory
PROJECT_DIR=$(dirname "$SCRIPT_DIR")

# Change to the project directory
cd "$PROJECT_DIR"

echo "=== Auto-Deploy active in the directory: $PROJECT_DIR ==="

# Fetch the latest changes from the main branch
git fetch origin main

# Compare the local and remote commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date): New changes detected. Pulling the latest code..."
    
    # Reset local changes and pull the latest changes from the main branch
    git reset --hard HEAD
    git pull origin main
    
    echo "$(date): Updating Python dependencies..."
    # Activate virtual environment and install new packages if requirements.txt changed
    source .venv/bin/activate
    pip install -r requirements.txt
    
    echo "$(date): Restarting application service..."
    # Restart the FastAPI service to apply code changes
    sudo systemctl restart llm-api
    
    echo "$(date): Deployment completed successfully."
else
    echo "$(date): Code is up to date. No action required."
fi