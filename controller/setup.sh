#!/bin/sh

# Install Nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apk update
    apk add --no-cache nginx
fi

# Create directory for SSL certificates
mkdir -p /etc/nginx/ssl

# Create directory for container configs
mkdir -p /etc/nginx/conf.d

# Create Nginx configuration
cat > /etc/nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules/*.conf;

events {
  worker_connections 768;
}

http {
  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65;
  types_hash_max_size 2048;

  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  access_log /var/log/nginx/access.log;
  error_log /var/log/nginx/error.log;

  gzip on;

  server {
      listen 80;
      server_name code-sprint-backend.khaftab.me;
      return 301 https://$host$request_uri;
  }

  server {
      listen 443 ssl;
      server_name code-sprint-backend.khaftab.me;

      ssl_certificate /etc/nginx/ssl/fullchain.pem;
      ssl_certificate_key /etc/nginx/ssl/privkey.pem;

      ssl_protocols TLSv1.2 TLSv1.3;
      ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
      ssl_prefer_server_ciphers on;

      location /hello {
          return 200 "nginx is working with SSL!\n";
      }

      include /etc/nginx/conf.d/*.conf;

      location / {
          proxy_pass http://localhost:1337;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_cache_bypass $http_upgrade;
      }
  }
}
EOF

# Create initial containers config file
# cat > /etc/nginx/conf.d/containers.conf << 'EOF'
# server {
#   listen 80;
#   server_name your-domain.com;  # Replace with your actual domain

#   # Common settings
#   client_max_body_size 100M;
#   proxy_set_header Host $host;
#   proxy_set_header X-Real-IP $remote_addr;
#   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#   proxy_set_header X-Forwarded-Proto $scheme;

#   # Default location
#   location / {
#     return 200 "Container routing system is running";
#   }
# }
# EOF

# Set proper permissions
chown -R nginx:nginx /etc/nginx
chown -R nginx:nginx /etc/nginx/conf.d
chmod -R 644 /etc/nginx/conf.d
# chmod 400 /etc/nginx/ssl/key.pem

# Test Nginx configuration
nginx -t
nginx
# Restart Nginx
nginx -s reload

echo "Nginx has been configured as a reverse proxy for Docker containers."