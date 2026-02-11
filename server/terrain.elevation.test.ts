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
});
