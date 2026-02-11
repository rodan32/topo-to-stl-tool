/**
 * Moon terrain diagnostic: test STL generation for well-mapped regions.
 *
 * Direct mode (uses TerrainGenerator + geotiff – recommended for diagnosing Kaguya):
 *   npx tsx server/terrain.moon-diagnostic.ts
 *
 * API mode (hits running server):
 *   MOON_DIAG_API_URL=http://localhost:3001 npx tsx server/terrain.moon-diagnostic.ts
 *
 * Regions chosen for known topography:
 * - Apollo 15 (Hadley–Apennine): N 26.8°, S 25.1°, E 4.6°, W 2.7° - crater rims, mountains
 * - Tycho Crater: central peak ~2.3 km, rim ~4.7 km
 * - Apollo 11 (Mare Tranquillitatis): flat mare, ~100 m relief
 * - Copernicus: central peak, ~3.8 km
 */

import axios from "axios";
import { TerrainGenerator } from "./terrain";

interface MoonRegion {
  name: string;
  bounds: { north: number; south: number; east: number; west: number };
  expectedRelief?: string;
}

const MOON_REGIONS: MoonRegion[] = [
  {
    name: "Apollo 15 (Hadley–Apennine)",
    bounds: { north: 26.8, south: 25.1, east: 4.6, west: 2.7 },
    expectedRelief: "~2–4 km (crater floor to rim, Apennine mountains)",
  },
  {
    name: "Tycho Crater",
    bounds: { north: -43.0, south: -43.6, east: -11.0, west: -11.6 },
    expectedRelief: "~2–5 km (central peak, rim)",
  },
  {
    name: "Apollo 11 (Mare Tranquillitatis)",
    bounds: { north: 0.9, south: 0.4, east: 23.7, west: 23.2 },
    expectedRelief: "~0–200 m (relatively flat mare)",
  },
  {
    name: "Copernicus Crater",
    bounds: { north: 10.0, south: 9.2, east: -19.8, west: -20.2 },
    expectedRelief: "~2–4 km (central peak, rim)",
  },
  {
    name: "South Pole-Aitken (edge)",
    bounds: { north: -50, south: -56, east: 190, west: 184 },
    expectedRelief: "~2–8 km (basin depth)",
  },
];

const API_BASE = process.env.MOON_DIAG_API_URL;
const USE_DIRECT = !API_BASE;

/** Extract min/max Z from binary STL (vertex relief in model units). */
function stlVertexZRange(buf: Buffer): { minZ: number; maxZ: number } | null {
  if (buf.length < 84) return null;
  const triCount = buf.readUInt32LE(80);
  const expectedSize = 84 + triCount * 50;
  if (buf.length < expectedSize) return null;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let t = 0; t < triCount; t++) {
    const base = 84 + t * 50;
    for (const zOff of [20, 32, 44]) {
      const z = buf.readFloatLE(base + zOff);
      if (Number.isFinite(z)) {
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
  }
  if (minZ === Infinity || maxZ === -Infinity) return null;
  return { minZ, maxZ };
}

async function runDiagnosticDirect() {
  console.log("\n=== Moon Terrain Diagnostic (direct TerrainGenerator) ===\n");
  console.log("Uses Kaguya geotiff when available. Evaluates STL vertex relief.\n");

  for (const region of MOON_REGIONS) {
    const gen = new TerrainGenerator({
      bounds: region.bounds,
      exaggeration: 1.25,
      baseHeight: 2,
      modelWidth: 100,
      resolution: "low",
      shape: "rectangle",
      planet: "moon",
      lithophane: false,
      invert: false,
    });

    try {
      const buf = await gen.generate();
      const moonUsedKaguya = gen.moonUsedKaguya;
      const fallbackTriggered = gen.fallbackTriggered;

      const triCount = buf.length >= 84 ? buf.readUInt32LE(80) : 0;
      const zRange = stlVertexZRange(buf);
      const reliefMm = zRange ? (zRange.maxZ - zRange.minZ).toFixed(1) : "—";

      const sourceLabel = moonUsedKaguya
        ? "Kaguya TC DTMs (true elevation)"
        : "CARTO fallback (hillshaded albedo – may be spiky)";

      console.log(`--- ${region.name} ---`);
      console.log(`  Source: ${sourceLabel}`);
      console.log(`  moonUsedKaguya: ${moonUsedKaguya}`);
      console.log(`  STL: ${buf.length} bytes, ${triCount} triangles`);
      console.log(`  Vertex Z relief: ${reliefMm} mm (in model)`);
      if (fallbackTriggered) console.log(`  (fallback triggered)`);
      if (region.expectedRelief) {
        console.log(`  Expected relief: ${region.expectedRelief}`);
      }
      console.log("");
    } catch (e) {
      console.log(`--- ${region.name} ---`);
      console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
      console.log("");
    }
  }
}

async function runDiagnosticAPI() {
  console.log("\n=== Moon Terrain Diagnostic (via API) ===\n");
  console.log(`API: ${API_BASE}/api/trpc/terrain.generate\n`);

  for (const region of MOON_REGIONS) {
    const payload = {
      bounds: region.bounds,
      exaggeration: 1.25,
      baseHeight: 2,
      modelWidth: 100,
      resolution: "low",
      shape: "rectangle",
      planet: "moon",
      lithophane: false,
      invert: false,
    };

    try {
      const res = await axios.post(
        `${API_BASE}/api/trpc/terrain.generate`,
        { json: payload },
        { responseType: "json", timeout: 60000 }
      );

      const data = res.data?.result?.data?.json;
      if (!data) {
        console.log(`--- ${region.name} ---`);
        console.log(`  ERROR: No data in response`);
        console.log("");
        continue;
      }

      const stlB64 = data.stl;
      const moonUsedKaguya = data.moonUsedKaguya ?? false;
      const fallbackTriggered = data.fallbackTriggered ?? false;

      let buf: Buffer;
      try {
        buf = Buffer.from(stlB64, "base64");
      } catch {
        console.log(`--- ${region.name} ---`);
        console.log(`  ERROR: Invalid base64 STL`);
        console.log("");
        continue;
      }

      const triCount = buf.length >= 84 ? buf.readUInt32LE(80) : 0;
      const zRange = stlVertexZRange(buf);
      const reliefMm = zRange ? (zRange.maxZ - zRange.minZ).toFixed(1) : "—";

      const sourceLabel = moonUsedKaguya
        ? "Kaguya TC DTMs (true elevation)"
        : "CARTO fallback (hillshaded albedo – may be spiky)";

      console.log(`--- ${region.name} ---`);
      console.log(`  Source: ${sourceLabel}`);
      console.log(`  moonUsedKaguya: ${moonUsedKaguya}`);
      console.log(`  STL: ${buf.length} bytes, ${triCount} triangles`);
      console.log(`  Vertex Z relief: ${reliefMm} mm (in model)`);
      if (fallbackTriggered) console.log(`  (fallback triggered)`);
      if (region.expectedRelief) {
        console.log(`  Expected relief: ${region.expectedRelief}`);
      }
      console.log("");
    } catch (e) {
      console.log(`--- ${region.name} ---`);
      console.log(
        `  ERROR: ${e instanceof Error ? e.message : String(e)}`
      );
      if (axios.isAxiosError(e) && e.response?.data) {
        console.log(`  Response: ${JSON.stringify(e.response.data).slice(0, 200)}...`);
      }
      console.log("");
    }
  }
}

async function runDiagnostic() {
  if (USE_DIRECT) {
    await runDiagnosticDirect();
  } else {
    await runDiagnosticAPI();
  }
}

runDiagnostic().catch((e) => {
  console.error(e);
  process.exit(1);
});
