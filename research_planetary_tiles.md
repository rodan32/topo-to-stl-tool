# Planetary Map Tile Sources

## Mars
- **MOLA (Mars Orbiter Laser Altimeter)**
  - OpenPlanetary: `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-1/all/{z}/{x}/{y}.png` (Current - seems broken/blank?)
  - USGS Astrogeology: `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/{z}/{y}/{x}.jpg` (Check coordinate order: TMS vs XYZ)
  - ESRI: `https://astro.arcgis.com/arcgis/rest/services/OnMars/MOLAColor/MapServer/tile/{z}/{y}/{x}`

## Moon
- **LRO (Lunar Reconnaissance Orbiter)**
  - OpenPlanetary: `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/{z}/{x}/{y}.png` (Current - seems broken/blank?)
  - USGS Astrogeology: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_DEM_Global_64ppd_1024/1.0.0//default/default028mm/{z}/{y}/{x}.jpg`

## Issues
- The CartoCDN URLs might be deprecated or require an API key now.
- NASA Trek tiles often use TMS (y-inverted) coordinates, so `{y}` needs to be `{2^z - 1 - y}`.
- Leaflet uses XYZ by default. `tms: true` option can handle inversion.

## Plan
1. Test NASA Trek tiles directly.
2. If TMS is needed, enable it in Leaflet options.
3. Fallback to ESRI for Mars if NASA is slow.
