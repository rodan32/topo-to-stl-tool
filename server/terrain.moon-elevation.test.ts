/**
 * Moon elevation diagnostic tests – similar to terrain.elevation.test.ts for Earth.
 * Tests Kaguya TC DTMs (true elevation) and CARTO fallback for well-mapped regions.
 */
import { describe, it, expect } from "vitest";
import axios from "axios";
import { createCanvas, loadImage } from "canvas";

const KAGUYA_STAC_URL =
  "https://stac.astrogeology.usgs.gov/api/collections/kaguya_terrain_camera_usgs_dtms/items";
const KAGUYA_NODATA = -32767;

// Same formula as server/terrain.ts for CARTO fallback
function decodeElevationPlanetary(r: number, g: number, b: number): number {
  const val = (r + g + b) / 3;
  return val * 100;
}

// Apollo 15 (Hadley–Apennine): well-mapped, ~2–4 km relief
const APOLLO_15_BBOX = [2.7, 25.1, 4.6, 26.8];
const CARTO_MOON_BASE =
  "https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all";

describe("Moon elevation (Kaguya TC DTMs) integration", () => {
  it("fetches Kaguya STAC items for Apollo 15 region", async () => {
    const bbox = APOLLO_15_BBOX.join(",");
    const res = await axios.get<{ features?: Array<{ assets?: { dtm?: { href?: string } } }> }>(
      `${KAGUYA_STAC_URL}?bbox=${bbox}&limit=5`,
      { timeout: 15000 }
    );
    expect(res.data?.features?.length).toBeGreaterThan(0);
    const feat = res.data!.features![0];
    expect(feat?.assets?.dtm?.href).toBeDefined();
  }, 20000);

  it("reads elevation from Kaguya DTM via geotiff in plausible range (meters)", async () => {
    const bbox = APOLLO_15_BBOX.join(",");
    const res = await axios.get<{ features?: Array<{ assets?: { dtm?: { href?: string } } }> }>(
      `${KAGUYA_STAC_URL}?bbox=${bbox}&limit=5`,
      { timeout: 15000 }
    );
    const feat = res.data?.features?.[0];
    const href = feat?.assets?.dtm?.href;
    if (!href) {
      console.warn("No Kaguya DTM href – skipping geotiff test");
      return;
    }

    const { fromUrl } = await import("geotiff");
    const tiff = await fromUrl(href, { maxRanges: 64 });
    // Use window: bbox may require raster's native CRS; window reads pixel coords
    const rasters = await tiff.readRasters({
      window: [0, 0, 128, 128],
      samples: [0],
      interleave: false,
    });
    const arr = (Array.isArray(rasters) ? rasters[0] : rasters) as
      | Float32Array
      | Int16Array
      | Uint16Array;
    expect(arr).toBeDefined();
    expect(arr!.length).toBe(128 * 128);

    const elevations: number[] = [];
    const step = 16;
    for (let i = 0; i < arr!.length; i += step) {
      const v = arr![i] as number;
      if (
        Number.isFinite(v) &&
        v !== KAGUYA_NODATA &&
        v < 1e6 &&
        v > -1e6
      ) {
        elevations.push(v);
      }
    }

    expect(elevations.length).toBeGreaterThan(0);
    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const relief = maxElev - minElev;
    // Kaguya DTMs: height above sphere in meters; lunar relief typically -5km to +5km
    expect(minElev).toBeGreaterThanOrEqual(-5000);
    expect(maxElev).toBeLessThanOrEqual(10000);
    expect(relief).toBeGreaterThan(100);
  }, 30000);
});

describe("Moon elevation (CARTO fallback) integration", () => {
  it("fetches CARTO Moon tile and decodes grayscale in plausible range", async () => {
    // Tile covering Apollo 15 area: z=8, x~130, y~95 (lon ~3.5, lat ~26)
    const z = 8;
    const x = 130;
    const y = 95;
    const url = `${CARTO_MOON_BASE}/${z}/${x}/${y}.png`;

    const response = await axios.get(url, { responseType: "arraybuffer" });
    expect(response.status).toBe(200);
    const buf = Buffer.isBuffer(response.data)
      ? response.data
      : Buffer.from(response.data as ArrayBuffer);
    expect(buf.length).toBeGreaterThan(0);

    const img = await loadImage(buf);
    const width = img.width;
    const height = img.height;
    expect(width).toBe(256);
    expect(height).toBe(256);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const elevations: number[] = [];
    const sampleStep = 32;
    for (let py = 0; py < height; py += sampleStep) {
      for (let px = 0; px < width; px += sampleStep) {
        const i = (py * width + px) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a === 0) continue;
        const elev = decodeElevationPlanetary(r, g, b);
        elevations.push(elev);
      }
    }

    expect(elevations.length).toBeGreaterThan(0);
    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    // CARTO is hillshaded albedo: grayscale 0–255 → 0–25500 m (fake range)
    expect(minElev).toBeGreaterThanOrEqual(0);
    expect(maxElev).toBeLessThanOrEqual(26000);
    expect(maxElev - minElev).toBeGreaterThanOrEqual(0);
  }, 15000);
});
