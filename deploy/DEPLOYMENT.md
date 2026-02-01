# Deployment Guide for Linux Server

This guide will help you deploy Topo to STL on your Linux server at 192.168.0.41.

## Prerequisites

1. **Node.js 20.11+** installed
   ```bash
   node --version  # Should be 20.11.0 or higher
   ```

2. **pnpm** installed
   ```bash
   npm install -g pnpm
   ```

3. **Nginx** installed and running
   ```bash
   sudo systemctl status nginx
   ```

## Step 1: Clone and Build

```bash
# Choose your deployment directory (example: /var/www/topo-to-stl)
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/rodan32/topo-to-stl.git
cd topo-to-stl
sudo chown -R $USER:$USER .

# Install dependencies
pnpm install

# Create .env file
cp .env.example .env
nano .env  # Edit with your values

# Build the application
pnpm build
```

## Step 2: Configure Nginx

```bash
# Copy the Nginx config
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/topo-to-stl

# Edit the config (change server_name if needed)
sudo nano /etc/nginx/sites-available/topo-to-stl

# Enable the site
sudo ln -s /etc/nginx/sites-available/topo-to-stl /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## Step 3: Set Up Systemd Service

```bash
# Copy the service file
sudo cp deploy/topo-to-stl.service.example /etc/systemd/system/topo-to-stl.service

# Edit the service file (update paths and user)
sudo nano /etc/systemd/system/topo-to-stl.service
# Make sure to update:
# - User (if not www-data)
# - WorkingDirectory (your deployment path)
# - EnvironmentFile (path to .env)

# Reload systemd
sudo systemctl daemon-reload

# Enable and start the service
sudo systemctl enable topo-to-stl
sudo systemctl start topo-to-stl

# Check status
sudo systemctl status topo-to-stl
```

## Step 4: Verify Deployment

1. **Check the Node.js service:**
   ```bash
   sudo systemctl status topo-to-stl
   sudo journalctl -u topo-to-stl -f  # View logs
   ```

2. **Check Nginx:**
   ```bash
   sudo systemctl status nginx
   ```

3. **Test the application:**
   - Open browser: `http://192.168.0.41`
   - Or if you have a domain: `http://your-domain.com`

## Alternative: Using PM2

If you prefer PM2 over systemd:

```bash
# Install PM2
npm install -g pm2

# Start the application
cd /var/www/topo-to-stl
pm2 start dist/index.js --name topo-to-stl --env production

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
# Follow the instructions it prints
```

## Troubleshooting

### Service won't start
- Check logs: `sudo journalctl -u topo-to-stl -n 50`
- Verify Node.js version: `node --version` (needs 20.11+)
- Check .env file exists and has correct values
- Verify paths in service file are correct

### Nginx 502 Bad Gateway
- Check if Node.js service is running: `sudo systemctl status topo-to-stl`
- Verify port 3000 is listening: `sudo netstat -tlnp | grep 3000`
- Check Node.js logs for errors

### Can't access the site
- Check firewall: `sudo ufw status`
- Verify Nginx is running: `sudo systemctl status nginx`
- Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`

## Updating the Application

```bash
cd /var/www/topo-to-stl
git pull
pnpm install
pnpm build
sudo systemctl restart topo-to-stl
```

## File Permissions

Make sure the deployment directory has correct permissions:
```bash
sudo chown -R www-data:www-data /var/www/topo-to-stl
# Or if using a different user:
sudo chown -R youruser:youruser /var/www/topo-to-stl
```
