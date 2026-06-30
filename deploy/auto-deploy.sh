#!/bin/bash
# Force the script to fail loudly on errors
set -euo pipefail

# Navigate to the project directory
cd /opt/projektberichtFullstack

# Fetch the latest changes from the main branch
git fetch origin main

# Compare the local and remote commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date): New changes detected. Pulling the latest code..."
    
    # Pull the latest changes from the main branch
    git pull origin main
    
    # Run the setup script to ensure all dependencies are installed and the environment is set up correctly
    ./setup-server.sh
    
    echo "$(date): Deployment completed successfully."
else
    echo "$(date): Code is up to date. No action required."
fi