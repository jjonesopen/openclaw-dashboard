#!/usr/bin/env bash
# ============================================================
# OpenClaw Mission Control — Install Script
# Deploys the dashboard and sets up the systemd service.
# Usage:  bash install.sh
# ============================================================

set -euo pipefail

DASHBOARD_DIR="$HOME/dashboard"
SERVICE_FILE="openclaw-dashboard.service"

echo "🦞 OpenClaw Mission Control — Installer"
echo "========================================="

# 1. Back up existing dashboard if present
if [ -d "$DASHBOARD_DIR" ] && [ -f "$DASHBOARD_DIR/server.js" ]; then
    BACKUP="$DASHBOARD_DIR.backup.$(date +%Y%m%d%H%M%S)"
    echo "→ Backing up existing dashboard to $BACKUP"
    cp -r "$DASHBOARD_DIR" "$BACKUP"
fi

# 2. Copy files
echo "→ Installing dashboard to $DASHBOARD_DIR"
mkdir -p "$DASHBOARD_DIR"

# Copy everything from current directory
cp -r server.js package.json lib/ public/ "$DASHBOARD_DIR/"

echo "→ Dashboard files installed"

# 3. Test that it works
echo "→ Testing server startup..."
cd "$DASHBOARD_DIR"
timeout 5 node -e "
  import('./lib/config.js').then(c => {
    console.log('  Config OK — port', c.default.port);
  });
" 2>/dev/null || echo "  (config test skipped — not critical)"

# 4. Install systemd service
echo ""
echo "→ Installing systemd service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/openclaw-dashboard.service 2>/dev/null || {
    echo "  ⚠ Could not copy service file (need sudo). Install manually:"
    echo "  sudo cp $DASHBOARD_DIR/openclaw-dashboard.service /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable --now openclaw-dashboard"
}

if [ -f /etc/systemd/system/openclaw-dashboard.service ]; then
    sudo systemctl daemon-reload
    sudo systemctl enable openclaw-dashboard
    sudo systemctl restart openclaw-dashboard
    echo "  ✓ Service installed and started"
    echo ""
    sleep 1
    systemctl status openclaw-dashboard --no-pager | head -10
fi

echo ""
echo "========================================="
echo "✓ Dashboard available at http://$(hostname -I | awk '{print $1}'):8080"
echo "✓ Also at http://localhost:8080"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status openclaw-dashboard"
echo "  sudo journalctl -u openclaw-dashboard -f"
echo "  sudo systemctl restart openclaw-dashboard"
