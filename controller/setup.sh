#!/bin/sh

# Install Nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apk update
    apk add --no-cache nginx
fi

# Create directory for container configs
mkdir -p /etc/nginx/conf.d

# Test Nginx configuration
nginx -t
# start Nginx
nginx
# Restart Nginx
nginx -s reload

echo "Nginx has been configured as a reverse proxy for Docker containers."