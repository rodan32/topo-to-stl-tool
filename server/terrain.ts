import { createCanvas, loadImage } from "canvas";
import axios from "axios";

interface TerrainOptions {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  exaggeration: number;
  baseHeight: number;
  modelWidth: number; // in mm
  resolution: "low" | "medium" | "high" | "ultra";
  shape: "rectangle" | "oval";
  planet: "earth" | "mars" | "moon";
  lithophane: boolean;
  invert: boolean;
}

// AWS Terrarium encoding: (r * 256 + g + b / 256) - 32768
const decodeElevationEarth = (r: number, g: number, b: number): number => {
  return r * 256 + g + b / 256 - 32768;
};

// Simple grayscale decoding for Moon/Mars
const decodeElevationPlanetary = (r: number, g: number, b: number): number => {
  const val = (r + g + b) / 3;
  return val * 100;
};

// Calculate tile coordinates from lat/lon and zoom
const long2tile = (lon: number, zoom: number) => {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
};

const lat2tile = (lat: number, zoom: number) => {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
};

// STL Binary Writer
function createSTLBinary(vertices: number[], indices: number[]): Buffer {
  const triangleCount = indices.length / 3;
  const bufferSize = 80 + 4 + triangleCount * 50; // Header + count + triangles
  const buffer = Buffer.alloc(bufferSize);

  // Write header (80 bytes)
  buffer.write("Binary STL from Topo-to-STL", 0, 80, "ascii");

  // Write triangle count
  buffer.writeUInt32LE(triangleCount, 80);

  let offset = 84;

  for (let i = 0; i < triangleCount; i++) {
    const i1 = indices[i * 3];
    const i2 = indices[i * 3 + 1];
    const i3 = indices[i * 3 + 2];

    const v1 = [vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]];
    const v2 = [vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]];
    const v3 = [vertices[i3 * 3], vertices[i3 * 3 + 1], vertices[i3 * 3 + 2]];

    // Calculate normal
    const u = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const v = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];

    // Normalize
    const len = Math.sqrt(
      normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]
    );
    if (len > 0) {
      normal[0] /= len;
      normal[1] /= len;
      normal[2] /= len;
    }

    // Write normal
    buffer.writeFloatLE(normal[0], offset);
    buffer.writeFloatLE(normal[1], offset + 4);
    buffer.writeFloatLE(normal[2], offset + 8);

    // Write vertices
    buffer.writeFloatLE(v1[0], offset + 12);
    buffer.writeFloatLE(v1[1], offset + 16);
    buffer.writeFloatLE(v1[2], offset + 20);

    buffer.writeFloatLE(v2[0], offset + 24);
    buffer.writeFloatLE(v2[1], offset + 28);
    buffer.writeFloatLE(v2[2], offset + 32);

    buffer.writeFloatLE(v3[0], offset + 36);
    buffer.writeFloatLE(v3[1], offset + 40);
    buffer.writeFloatLE(v3[2], offset + 44);

    // Write attribute byte count (0)
    buffer.writeUInt16LE(0, offset + 48);

    offset += 50;
  }

  return buffer;
}

export class TerrainGenerator {
  private options: TerrainOptions;
  public fallbackTriggered: boolean = false;

  constructor(options: TerrainOptions) {
    this.options = options;
  }

  private getZoomLevel(): number {
    switch (this.options.resolution) {
      case "low":
        return 11;
      case "medium":
        return 12;
      case "high":
        return 13;
      case "ultra":
        return 14;
      default:
        return 12;
    }
  }

  async generate(): Promise<Buffer> {
    console.log("Starting Server-Side Terrain Generation", this.options);
    const {
      bounds,
      exaggeration,
      baseHeight,
      modelWidth,
      shape,
      planet,
      lithophane,
      invert,
    } = this.options;
    let zoom = this.getZoomLevel();

    // Calculate dimensions
    let xMin = long2tile(bounds.west, zoom);
    let xMax = long2tile(bounds.east, zoom);
    let yMin = lat2tile(bounds.north, zoom);
    let yMax = lat2tile(bounds.south, zoom);

    // Check if the requested area is too large
    const MAX_PIXELS = 4096;
    let width = (xMax - xMin + 1) * 256;
    let height = (yMax - yMin + 1) * 256;

    if (width > MAX_PIXELS || height > MAX_PIXELS) {
      console.warn(
        `Area too large for Zoom ${zoom} (${width}x${height}). Downgrading resolution.`
      );
      this.fallbackTriggered = true;

      while ((width > MAX_PIXELS || height > MAX_PIXELS) && zoom > 5) {
        zoom--;
        xMin = long2tile(bounds.west, zoom);
        xMax = long2tile(bounds.east, zoom);
        yMin = lat2tile(bounds.north, zoom);
        yMax = lat2tile(bounds.south, zoom);
        width = (xMax - xMin + 1) * 256;
        height = (yMax - yMin + 1) * 256;
      }
      console.log(`New Zoom: ${zoom} (${width}x${height})`);
    }

    console.log(`Grid: X[${xMin}-${xMax}] Y[${yMin}-${yMax}] Zoom: ${zoom}`);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const tilePromises = [];
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tilePromises.push(this.loadTile(x, y, zoom, x - xMin, y - yMin, ctx, planet));
      }
    }

    await Promise.all(tilePromises);
    console.log("All tiles loaded");

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    console.log(`Image Data size: ${data.length}, W: ${width}, H: ${height}`);

    const latSpan = bounds.north - bounds.south;
    const lonSpan = bounds.east - bounds.west;
    const aspectRatio = lonSpan / latSpan;

    // Dynamic resolution
    let maxSegments = 256;
    if (this.options.resolution === "low") maxSegments = 128;
    if (this.options.resolution === "medium") maxSegments = 256;
    if (this.options.resolution === "high") maxSegments = 384;
    if (this.options.resolution === "ultra") maxSegments = 1024;

    const segmentsX = Math.min(width, maxSegments);
    const segmentsY = Math.round(segmentsX / aspectRatio);

    const modelHeight = modelWidth / aspectRatio;

    console.log(
      `Mesh Grid: ${segmentsX}x${segmentsY}, Model Size: ${modelWidth}x${modelHeight}`
    );

    const vertices: number[] = [];
    const indices: number[] = [];

    const getElevation = (col: number, row: number) => {
      const imgX = Math.floor((col / (segmentsX - 1)) * (width - 1));
      const imgY = Math.floor((row / (segmentsY - 1)) * (height - 1));

      const index = (imgY * width + imgX) * 4;
      if (index < 0 || index >= data.length) return 0;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      const a = data[index + 3];
      if (a === 0) return null;

      if (planet === "earth") {
        return decodeElevationEarth(r, g, b);
      } else {
        return decodeElevationPlanetary(r, g, b);
      }
    };

    let minElev = Infinity;
    let maxElev = -Infinity;
    let validPoints = 0;

    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        if (shape === "oval") {
          const cx = (segmentsX - 1) / 2;
          const cy = (segmentsY - 1) / 2;
          const dx = (x - cx) / cx;
          const dy = (y - cy) / cy;
          if (dx * dx + dy * dy > 1.0) continue;
        }

        const elev = getElevation(x, y);
        if (elev !== null) {
          if (elev < minElev) minElev = elev;
          if (elev > maxElev) maxElev = elev;
          validPoints++;
        }
      }
    }

    if (validPoints === 0 || minElev === Infinity || maxElev === -Infinity) {
      console.warn("No valid elevation points found. Using default flat terrain.");
      minElev = 0;
      maxElev = 100;
      validPoints = 1;
    }

    console.log(`Elevation Range: ${minElev} to ${maxElev}`);

    const centerLat = (bounds.north + bounds.south) / 2;
    const metersPerDegreeLon = 111132.954 * Math.cos((centerLat * Math.PI) / 180);
    const realWidthMeters = lonSpan * metersPerDegreeLon;
    let scale = modelWidth / realWidthMeters;

    if (planet !== "earth") {
      const elevRange = maxElev - minElev;
      if (elevRange === 0) scale = 1;
      else {
        const targetRelief = modelWidth * 0.15;
        scale = targetRelief / elevRange;
      }
    }

    const minThickness = 0.8;
    const maxThickness = 4.0;
    const thicknessRange = maxThickness - minThickness;
    const elevationRange = maxElev - minElev || 1;

    const gridMap = new Int32Array(segmentsX * segmentsY).fill(-1);

    // Generate Top Surface
    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        if (shape === "oval") {
          const cx = (segmentsX - 1) / 2;
          const cy = (segmentsY - 1) / 2;
          const dx = (x - cx) / cx;
          const dy = (y - cy) / cy;
          if (dx * dx + dy * dy > 1.0) continue;
        }

        let elev = getElevation(x, y);
        if (elev === null) elev = minElev;

        let z = 0;

        if (lithophane) {
          let norm = (elev - minElev) / elevationRange;
          if (invert) norm = 1.0 - norm;
          z = minThickness + norm * thicknessRange;
        } else {
          if (invert) elev = -elev;
          z = (elev - minElev) * exaggeration * scale + baseHeight;
        }

        const px = (x / (segmentsX - 1)) * modelWidth - modelWidth / 2;
        const py = -((y / (segmentsY - 1)) * modelHeight - modelHeight / 2);

        vertices.push(px, py, z);
        gridMap[y * segmentsX + x] = vertices.length / 3 - 1;
      }
    }

    const numTopVertices = vertices.length / 3;
    console.log(`Generated ${numTopVertices} vertices for top surface`);

    if (numTopVertices === 0) {
      throw new Error("No vertices generated. Check selection bounds and shape.");
    }

    // Generate Bottom Surface
    for (let i = 0; i < numTopVertices; i++) {
      vertices.push(vertices[i * 3], vertices[i * 3 + 1], 0);
    }

    // Generate Triangles
    const addQuad = (v1: number, v2: number, v3: number, v4: number) => {
      indices.push(v1, v4, v2);
      indices.push(v2, v4, v3);
    };

    // Top Surface
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const idx1 = gridMap[y * segmentsX + x];
        const idx2 = gridMap[y * segmentsX + x + 1];
        const idx3 = gridMap[(y + 1) * segmentsX + x + 1];
        const idx4 = gridMap[(y + 1) * segmentsX + x];

        if (idx1 !== -1 && idx2 !== -1 && idx3 !== -1 && idx4 !== -1) {
          addQuad(idx1, idx2, idx3, idx4);
        }
      }
    }

    // Bottom Surface
    const offset = numTopVertices;
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const idx1 = gridMap[y * segmentsX + x];
        const idx2 = gridMap[y * segmentsX + x + 1];
        const idx3 = gridMap[(y + 1) * segmentsX + x + 1];
        const idx4 = gridMap[(y + 1) * segmentsX + x];

        if (idx1 !== -1 && idx2 !== -1 && idx3 !== -1 && idx4 !== -1) {
          indices.push(offset + idx1, offset + idx2, offset + idx4);
          indices.push(offset + idx2, offset + idx3, offset + idx4);
        }
      }
    }

    // Wall Generation
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const tl = gridMap[y * segmentsX + x];
        const tr = gridMap[y * segmentsX + x + 1];
        const br = gridMap[(y + 1) * segmentsX + x + 1];
        const bl = gridMap[(y + 1) * segmentsX + x];

        const isCellValid = tl !== -1 && tr !== -1 && br !== -1 && bl !== -1;

        if (isCellValid) {
          // Top Neighbor
          let topValid = false;
          if (y > 0) {
            const n_bl = gridMap[(y - 1 + 1) * segmentsX + x];
            const n_br = gridMap[(y - 1 + 1) * segmentsX + x + 1];
            const n_tl = gridMap[(y - 1) * segmentsX + x];
            const n_tr = gridMap[(y - 1) * segmentsX + x + 1];
            if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1)
              topValid = true;
          }
          if (!topValid) {
            indices.push(tl, offset + tr, offset + tl);
            indices.push(tl, tr, offset + tr);
          }

          // Bottom Neighbor
          let botValid = false;
          if (y < segmentsY - 2) {
            const n_tl = gridMap[(y + 1) * segmentsX + x];
            const n_tr = gridMap[(y + 1) * segmentsX + x + 1];
            const n_bl = gridMap[(y + 2) * segmentsX + x];
            const n_br = gridMap[(y + 2) * segmentsX + x + 1];
            if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1)
              botValid = true;
          }
          if (!botValid) {
            indices.push(br, bl, offset + bl);
            indices.push(br, offset + bl, offset + br);
          }

          // Left Neighbor
          let leftValid = false;
          if (x > 0) {
            const n_tr = gridMap[y * segmentsX + x - 1 + 1];
            const n_br = gridMap[(y + 1) * segmentsX + x - 1 + 1];
            const n_tl = gridMap[y * segmentsX + x - 1];
            const n_bl = gridMap[(y + 1) * segmentsX + x - 1];
            if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1)
              leftValid = true;
          }
          if (!leftValid) {
            indices.push(bl, tl, offset + tl);
            indices.push(bl, offset + tl, offset + bl);
          }

          // Right Neighbor
          let rightValid = false;
          if (x < segmentsX - 2) {
            const n_tl = gridMap[y * segmentsX + x + 1];
            const n_bl = gridMap[(y + 1) * segmentsX + x + 1];
            const n_tr = gridMap[y * segmentsX + x + 2];
            const n_br = gridMap[(y + 1) * segmentsX + x + 2];
            if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1)
              rightValid = true;
          }
          if (!rightValid) {
            indices.push(tr, br, offset + br);
            indices.push(tr, offset + br, offset + tr);
          }
        }
      }
    }

    console.log("Mesh created, starting STL export...");

    const stlBuffer = createSTLBinary(vertices, indices);
    console.log(`STL Export successful, size: ${stlBuffer.length}`);

    return stlBuffer;
  }

  private async loadTile(
    x: number,
    y: number,
    z: number,
    offsetX: number,
    offsetY: number,
    ctx: any,
    planet: string
  ): Promise<void> {
    try {
      let url = "";

      if (planet === "earth") {
        url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      } else if (planet === "mars") {
        url = `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-1/all/${z}/${x}/${y}.png`;
      } else {
        url = `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/${z}/${x}/${y}.png`;
      }

      const response = await axios.get(url, { responseType: "arraybuffer" });
      const img = await loadImage(Buffer.from(response.data));
      ctx.drawImage(img, offsetX * 256, offsetY * 256);
    } catch (error) {
      console.warn(`Failed to load tile ${z}/${x}/${y} for ${planet}.`, error);
      // Continue without this tile
    }
  }
}
