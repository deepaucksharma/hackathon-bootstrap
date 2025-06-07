#!/bin/bash

# Setup script for systemd service
# Run with sudo

set -e

CLUSTER_NAME="$1"
SERVICE_NAME="kafka-streamer-${CLUSTER_NAME}"
INSTALL_DIR="/opt/newrelic/kafka-entity-synthesis"

if [ -z "$CLUSTER_NAME" ]; then
    echo "Usage: sudo ./setup-systemd.sh <cluster-name>"
    exit 1
fi

echo "Setting up systemd service for Kafka cluster: $CLUSTER_NAME"

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p /var/log/newrelic
mkdir -p /etc/newrelic

# Create newrelic user if not exists
if ! id "newrelic" &>/dev/null; then
    echo "Creating newrelic user..."
    useradd -r -s /bin/false newrelic
fi

# Copy files
echo "Copying application files..."
cp -r ./* "$INSTALL_DIR/"
chown -R newrelic:newrelic "$INSTALL_DIR"
chown -R newrelic:newrelic /var/log/newrelic

# Move .env to secure location
if [ -f ".env" ]; then
    echo "Moving .env to /etc/newrelic/..."
    cp .env /etc/newrelic/kafka-entity-synthesis.env
    chmod 600 /etc/newrelic/kafka-entity-synthesis.env
    chown newrelic:newrelic /etc/newrelic/kafka-entity-synthesis.env
    
    # Update the application to use new env location
    cat > "$INSTALL_DIR/.env" << EOF
# Symlink to actual env file
# Real file at: /etc/newrelic/kafka-entity-synthesis.env
$(cat /etc/newrelic/kafka-entity-synthesis.env)
EOF
fi

# Create service file from template
echo "Creating systemd service..."
sed "s/\${CLUSTER_NAME}/$CLUSTER_NAME/g" kafka-streamer.service > "/etc/systemd/system/${SERVICE_NAME}.service"

# Create health check timer
cat > "/etc/systemd/system/${SERVICE_NAME}-health.service" << EOF
[Unit]
Description=Kafka Streamer Health Check for $CLUSTER_NAME
After=network.target

[Service]
Type=oneshot
User=newrelic
Group=newrelic
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node monitor-kafka-health.js $CLUSTER_NAME
StandardOutput=append:/var/log/newrelic/kafka-health.log
StandardError=append:/var/log/newrelic/kafka-health.error.log
EOF

cat > "/etc/systemd/system/${SERVICE_NAME}-health.timer" << EOF
[Unit]
Description=Run Kafka Health Check every 15 minutes
Requires=${SERVICE_NAME}-health.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
EOF

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

# Enable services
echo "Enabling services..."
systemctl enable "${SERVICE_NAME}.service"
systemctl enable "${SERVICE_NAME}-health.timer"

# Start services
echo "Starting services..."
systemctl start "${SERVICE_NAME}.service"
systemctl start "${SERVICE_NAME}-health.timer"

# Show status
echo
echo "✅ Setup complete!"
echo
echo "Service status:"
systemctl status "${SERVICE_NAME}.service" --no-pager

echo
echo "Useful commands:"
echo "  View logs:        journalctl -u ${SERVICE_NAME} -f"
echo "  Check status:     systemctl status ${SERVICE_NAME}"
echo "  Stop service:     systemctl stop ${SERVICE_NAME}"
echo "  Start service:    systemctl start ${SERVICE_NAME}"
echo "  View health logs: tail -f /var/log/newrelic/kafka-health.log"

# Create logrotate config
cat > "/etc/logrotate.d/kafka-streamer" << EOF
/var/log/newrelic/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 newrelic newrelic
    postrotate
        systemctl reload ${SERVICE_NAME} > /dev/null 2>&1 || true
    endscript
}
EOF

echo
echo "Log rotation configured at /etc/logrotate.d/kafka-streamer"