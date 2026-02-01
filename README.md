# Topo to STL

A specialized web tool for finding locations in topographical maps and converting that topo data into 3D-printable STL files.

![Project Screenshot](https://raw.githubusercontent.com/rodan32/topo-to-stl/main/screenshot.png)

## Features

- **Interactive Map**: Global map interface (Google Maps style) to easily find any location on Earth.
- **Rectangular Selection**: Draw a box to define the exact area you want to print.
- **Customizable Export**:
  - **Z-Exaggeration**: Scale vertical height (0.5x to 5x) to make terrain features more prominent.
  - **Base Thickness**: Add a solid base (1mm to 20mm) for structural integrity.
  - **Resolution Control**: Adjust mesh detail level to balance quality vs. file size.
- **Server-Side Processing**: Terrain generation and STL file creation happens on the server for better performance and reliability.
- **Watertight STL**: Generates solid, manifold meshes ready for slicers (Cura, PrusaSlicer, Bambu Studio).

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Node.js + Express + tRPC
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **3D Engine**: Three.js (preview), node-canvas (server-side generation)
- **Map Data**: OpenTopoMap (free, OpenStreetMap-based), AWS Terrain Tiles (Elevation Data)

## Self-Hosting Guide

This application is designed to be easily self-hosted on a Linux VM.

### Prerequisites

- Node.js 20.11+ (required for `import.meta.dirname` support)
- pnpm

### Direct Node.js Deployment

1. **Clone and install:**
```bash
git clone https://github.com/rodan32/topo-to-stl.git
cd topo-to-stl
pnpm install
```

2. **Create environment file:**
Create a `.env` file in the root directory:
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret-key-here-change-in-production
# VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here  # Optional - not required
```

3. **Build the application:**
```bash
pnpm build
```

This will generate:
- `dist/public/` - Frontend static files
- `dist/index.js` - Backend server bundle

4. **Start the server:**
```bash
pnpm start
```

### Using Nginx as Reverse Proxy (Optional)

For production, you may want to use Nginx as a reverse proxy in front of the Node.js server:

1. **Install and configure Nginx:**
Create `/etc/nginx/sites-available/topo-to-stl`:
```nginx
server {
    listen 80;
    server_name topo.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Increase body size for large STL file uploads
    client_max_body_size 50M;
}
```

2. **Enable the site:**
```bash
sudo ln -s /etc/nginx/sites-available/topo-to-stl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

3. **Run the Node.js server** (using PM2 or systemd):
```bash
# Using PM2
pm2 start dist/index.js --name topo-to-stl
pm2 save
pm2 startup
```

### Systemd Service (Optional)

Create `/etc/systemd/system/topo-to-stl.service`:
```ini
[Unit]
Description=Topo to STL Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/topo-to-stl
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then enable and start:
```bash
sudo systemctl enable topo-to-stl
sudo systemctl start topo-to-stl
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required
- `NODE_ENV` - Set to `production` for production deployment
- `PORT` - Port number for the server (default: 3000)
- `JWT_SECRET` - Secret key for JWT tokens (generate a random string)

### Optional
- `VITE_GOOGLE_MAPS_API_KEY` - Google Maps API key (optional - not required)
  - The app uses free OpenTopoMap for map display by default
  - Google Maps API is only needed for optional advanced features
- `DATABASE_URL` - Database connection string (only if using database features)
- `OAUTH_SERVER_URL` - OAuth server URL (only if using OAuth)
- `OWNER_OPEN_ID` - Owner OpenID (only if using OAuth)

Example `.env` file:
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret-key-here-change-in-production
# VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here  # Optional - not required
```

## Development

To run in development mode:

```bash
pnpm install
pnpm dev
```

This will start the development server with hot-reload at `http://localhost:3000`

## License

MIT
