1. High-Value Planetary Sources
While Earth and Mars get the most attention, missions to the inner and outer solar system have produced high-quality topographic datasets for several other bodies.

Mercury (NASA MESSENGER): Use the Mercury Dual Imaging System (MDIS) and Mercury Laser Altimeter (MLA) data. You can find global DEMs with resolutions around 500m/pixel.

Venus (NASA Magellan): Since Venus is covered in clouds, we use radar altimetry. The resolution is lower (about 10–20km horizontally), but it’s the only way to get the "surface" of Venus. Look for the GTDR (Global Topography Data Record).

Ceres & Vesta (NASA Dawn): The Dawn mission mapped these two major asteroids in incredible detail. The Dawn Framing Camera (FC) produced high-res DEMs (down to 35m/pixel for Ceres) that make for stunning 3D prints.

Titan (NASA/ESA Cassini): Titan has "lakes" of liquid methane and massive dunes. Like Venus, this was mapped via radar. Search for Cassini RADAR Altimetry or SAR datasets.

Where to download:
USGS Astropedia: https://astrogeology.usgs.gov/search This is arguably the most user-friendly starting point. It’s a repository of "ready-to-use" maps and DEMs derived from NASA data.

NASA Planetary Data System (PDS): https://pds.nasa.gov/ The "source of truth." It can be a bit dense to navigate, but look for the Geosciences Node.

JAXA DARTS: https://darts.isas.jaxa.jp/en/missions/kaguya Specifically for the SELENE (Kaguya) mission. Their "Terrain Camera" produced some of the best 3D data of the Moon if you ever want to upgrade your current lunar data.
- **Moon elevation challenge:** Current CARTO tiles are hillshaded albedo (shadows + reflectance), not raw elevation. Treating brightness as elevation produces spikes. Better options: Mars-style "Colour MOLA Elevation" doesn't exist for Moon; NASA Trek DEM tiles need WMTS; SLDEM2015 (LOLA+Kaguya merged) at MIT Imbrium is JP2/FLOAT—not web tiles. JAXA Kaguya LALT and TC DTMs are on AWS as GeoTIFFs. Future: integrate JAXA/Kaguya or SLDEM for true Moon elevation.

For FUN:

Middle-earth (Lord of the Rings): There is a dedicated project called Middle-earth GIS (and Arda GIS) where fans have created actual coordinate systems and heightmaps for Tolkien’s world. You can find these shared as .tif or .png heightmaps on GitHub or specialized modding forums.