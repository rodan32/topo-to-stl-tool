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
- **Browser-Based Processing**: All 3D generation happens locally in your browser—no heavy server processing required.
- **Watertight STL**: Generates solid, manifold meshes ready for slicers (Cura, PrusaSlicer, Bambu Studio).

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **3D Engine**: Three.js
- **Map Data**: Google Maps JS API (Visualization), AWS Terrain Tiles (Elevation Data)

## Self-Hosting Guide

This application is designed to be easily self-hosted on a Linux VM with Nginx.

### Prerequisites

- Node.js 18+
- Nginx

### 1. Build the Application

Clone the repository and build the static assets:

```bash
git clone https://github.com/rodan32/topo-to-stl.git
cd topo-to-stl
pnpm install
pnpm build
```

This will generate a `dist` folder containing the compiled HTML, CSS, and JavaScript files.

### 2. Configure Nginx

Create a new Nginx configuration file (e.g., `/etc/nginx/sites-available/topo-to-stl`):

```nginx
server {
    listen 80;
    server_name topo.yourdomain.com;

    root /var/www/topo-to-stl/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Optional: Gzip compression for faster loading
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

### 3. Deploy

1. Copy the contents of the `dist` folder to your web root (e.g., `/var/www/topo-to-stl/dist`).
2. Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/topo-to-stl /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## API Keys

This project uses Google Maps. For self-hosting, you will need your own Google Maps API Key with the following APIs enabled:
- Maps JavaScript API

Create a `.env` file in the root directory during build time:

```env
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
```

*Note: The current version uses a proxy for development. For production, you must replace the proxy implementation in `client/src/components/Map.tsx` with direct Google Maps loading using your key.*

## License

MIT
