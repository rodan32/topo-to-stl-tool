/**
 * Verification of elevation data integration for Earth (AWS Terrarium).
 * This does NOT use USGS US Topo / 3DEP; see DATA_SOURCES.md.
 */
import { describe, it, expect } from "vitest";
import axios from "axios";
import { createCanvas, loadImage } from "canvas";

const TERRARIUM_TILE_BASE =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

// Same formula as server/terrain.ts (AWS Terrarium encoding)
function decodeElevationTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

describe("Earth elevation (AWS Terrarium) integration", () => {
  it("fetches a Terrarium tile and decodes elevation in plausible range (meters)", async () => {
    // Tile covering part of continental US (e.g. Utah) at zoom 10
    const z = 10;
    const x = 256; // roughly central US longitude
    const y = 381;  // roughly Utah / Rockies latitude
    const url = `${TERRARIUM_TILE_BASE}/${z}/${x}/${y}.png`;

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
    const sampleStep = 32; // sample a grid
    for (let py = 0; py < height; py += sampleStep) {
      for (let px = 0; px < width; px += sampleStep) {
        const i = (py * width + px) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a === 0) continue; // no-data
        const elev = decodeElevationTerrarium(r, g, b);
        elevations.push(elev);
      }
    }

    expect(elevations.length).toBeGreaterThan(0);
    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    // Continental US elevations in meters: roughly -100 (Death Valley) to 4000+ (Rockies)
    expect(minElev).toBeGreaterThanOrEqual(-500);
    expect(maxElev).toBeLessThanOrEqual(10000);
    expect(maxElev - minElev).toBeGreaterThan(0);
  }, 15000);

  it("Open-Elevation API returns valid elevation for K2", async () => {
    const url = "https://api.open-elevation.com/api/v1/lookup?locations=35.88,76.51|36,77";
    const res = await axios.get<{ results?: Array<{ elevation: number; latitude: number; longitude: number }> }>(url);
    expect(res.status).toBe(200);
    const results = res.data?.results ?? [];
    expect(results.length).toBeGreaterThanOrEqual(2);
    const k2 = results.find((r) => Math.abs(r.latitude - 35.88) < 0.01 && Math.abs(r.longitude - 76.51) < 0.01);
    expect(k2).toBeDefined();
    expect(k2!.elevation).toBeGreaterThan(4000);
    expect(k2!.elevation).toBeLessThan(10000);
  }, 10000);

  it("fetches Open-Elevation fallback for K2 region when needed", async () => {
    const { TerrainGenerator } = await import("./terrain");
    const bounds = { north: 36.2, south: 35.5, east: 77.0, west: 76.2 }; // K2 region
    const gen = new TerrainGenerator({
      bounds,
      exaggeration: 1.5,
      baseHeight: 2,
      modelWidth: 100,
      resolution: "low",
      shape: "rectangle",
      planet: "earth",
      lithophane: false,
      invert: false,
    });
    const stl = await gen.generate();
    expect(stl.length).toBeGreaterThan(1000);
    expect(gen.elevationSource).toBeDefined();
    expect(["terrarium", "open-elevation"]).toContain(gen.elevationSource);
  }, 60000);

  const SPOT_REGIONS: Array<{ name: string; bounds: { north: number; south: number; east: number; west: number } }> = [
    { name: "South America (Andes)", bounds: { north: -32.5, south: -33.2, east: -69.8, west: -70.5 } }, // Aconcagua
    { name: "Africa (Kilimanjaro)", bounds: { north: -3.0, south: -3.6, east: 37.3, west: 36.8 } },
    { name: "Indian Ocean (ocean)", bounds: { north: -15, south: -18, east: 75, west: 72 } },
    { name: "Australia (Great Dividing Range)", bounds: { north: -33.8, south: -34.5, east: 150.2, west: 149.5 } },
    { name: "Europe (Alps)", bounds: { north: 45.9, south: 45.3, east: 7.0, west: 6.2 } }, // Mont Blanc region
  ];

  for (const region of SPOT_REGIONS) {
    it(`generates terrain for ${region.name}`, async () => {
      const { TerrainGenerator } = await import("./terrain");
      const gen = new TerrainGenerator({
        bounds: region.bounds,
        exaggeration: 1.5,
        baseHeight: 2,
        modelWidth: 100,
        resolution: "low",
        shape: "rectangle",
        planet: "earth",
        lithophane: false,
        invert: false,
      });
      const stl = await gen.generate();
      expect(stl.length).toBeGreaterThan(1000);
      expect(gen.elevationSource).toBeDefined();
      expect(["terrarium", "open-elevation"]).toContain(gen.elevationSource);
    }, 60000);
  }
});
