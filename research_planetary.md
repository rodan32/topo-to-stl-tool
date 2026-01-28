# Planetary Elevation Data Research

## Mars
**Source:** OpenPlanetary / MOLA (Mars Orbiter Laser Altimeter)
**Tile URL:** `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-1/all/{z}/{x}/{y}.png`
**Also available:** `https://api.nasa.gov/mars-wmts/catalog/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/{z}/{y}/{x}.png` (NASA WMTS)
**Format:** Need to verify if these are RGB encoded elevation or just visual maps.
**Note:** OpenPlanetary seems to provide "shaded relief" or "colorized" maps, which might be visual only. We need raw elevation data encoded in RGB (like the AWS Terrarium tiles) or a way to decode the color ramp.

## Moon
**Source:** USGS / LRO (Lunar Reconnaissance Orbiter) LOLA
**Tile URL:** `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/{z}/{x}/{y}.png`
**Note:** Similar to Mars, need to check if these are DEMs or visual maps.

## Alternative: Mapbox / QGIS approach
If pre-made RGB elevation tiles don't exist for Moon/Mars, we might need to:
1. Find a "Colorized Elevation" tile layer where color corresponds directly to height (e.g., MOLA color ramp).
2. Reverse-engineer the color ramp to get height values.

## Investigation
I need to check if `https://api.nasa.gov/mars-wmts` or similar services offer a "gray" or "raw" DEM layer.
Common format for web-elevation is "Mapbox Terrain-RGB" or "Terrarium".

**Potential Candidate for Mars:**
`https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_DEM_mosaic_global_463m_8/1.0.0//default/default028mm/{z}/{y}/{x}.png`

**Potential Candidate for Moon:**
`https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_DEM_Global_64ppd_1024/1.0.0//default/default028mm/{z}/{y}/{x}.png`

I will try to verify if these endpoints return data that can be interpreted as height.
