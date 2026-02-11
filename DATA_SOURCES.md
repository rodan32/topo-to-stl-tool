# Elevation & Map Data Sources

This document describes where the app gets its topo/elevation data and how to verify integration.

## Current integration

### Map display (what you see)

| Planet | Source | Notes |
|--------|--------|--------|
| **Earth** | [OpenTopoMap](https://opentopomap.org/) | OSM + SRTM–derived styling; display only. |
| **Mars** | CARTO OPM Mars basemap | Tiled imagery. |
| **Moon** | CARTO OPM Moon basemap | Tiled imagery. |
| **Venus** | [NOAA SOS Venus Topography](https://sos.noaa.gov/catalog/datasets/venus-topography/) | Single equirectangular image overlay (`2000.jpg`). |

**Image-overlay pattern:** Planets without tiled imagery (Venus, future Mercury, Ceres, Vesta, Titan) use `L.imageOverlay` with a full-globe equirectangular image. Add entries to `TILE_LAYERS` in `client/src/components/Map.tsx` with `type: "image"`, `url`, and `bounds: EQUIRECTANGULAR_BOUNDS`.

### Elevation for STL generation (height values)

| Planet | Source | Format | Notes |
|--------|--------|--------|--------|
| **Earth** | **AWS Terrarium** | RGB-encoded PNG tiles | Used for all Earth areas. Raw elevation in meters: `(R*256 + G + B/256) - 32768`. SRTM and other DEMs; no display-image interpretation. |
| **Mars** | CARTO OPM Mars basemap | Grayscale-style tiles | Approximate elevation from color. |
| **Moon** | CARTO OPM Moon basemap | Grayscale-style tiles | Approximate elevation from color. |
| **Venus** | USGS Magellan GeoTIFF | Global GeoTIFF | Direct fetch from planetarymaps.usgs.gov; radar altimetry. |

**Earth elevation in code** (`server/terrain.ts`):

- **AWS Terrarium** (all Earth): `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, decode `(R*256 + G + B/256) - 32768` (meters). Same encoding as Mapbox Terrain-RGB; one tile = one elevation value per pixel, no stretch or guesswork.
- **USGS 3DEP**: Not used for STL. The 3DEP ImageServer `exportImage` returns a **display** PNG (8‑bit stretched for visualization). Interpreting that as elevation produced wrong, spiky terrain. Raw 3DEP (e.g. WCS GetCoverage) could be added later for US if needed.

## Verifying Terrarium integration

From the repo root:

```bash
pnpm test -- server/terrain.elevation.test.ts
```

That test:

1. Fetches one AWS Terrarium tile (zoom 10, over US).
2. Decodes elevation at a few pixels with the same formula as production.
3. Asserts elevations are in a plausible range (meters).

If this passes, the Terrarium-based topo pipeline used for STL generation is working.

## References

- [Mapbox Terrain-RGB / Terrarium encoding](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md#what-is-the-data-format) (Terrarium formula).
- [USGS 3DEP Elevation ImageServer](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer).
- [USGS National Map](https://nationalmap.gov/).
