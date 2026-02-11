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
  planet: "earth" | "mars" | "moon" | "venus";
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

// USGS 3DEP elevation service (National Map) - used for Earth when bounds are in the US
const USGS_3DEP_EXPORT =
  "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage";

/** Rough bounds for US coverage (CONUS, Alaska, Hawaii, PR, etc.) */
function isBoundsInUS(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
}): boolean {
  const usWest = -180;
  const usEast = -64;
  const usSouth = 17;
  const usNorth = 72;
  return (
    bounds.west < usEast &&
    bounds.east > usWest &&
    bounds.south < usNorth &&
    bounds.north > usSouth
  );
}

/**
 * Fetch elevation raster from USGS 3DEP for the given WGS84 bounds.
 * Returns { data, width, height } in meters, or null on failure.
 * PNG from 3DEP is 8-bit stretched. The service uses dark = high elevation, light = low,
 * so we invert the gray scale to get correct terrain (peaks high, valleys low).
 */
async function fetchUSGS3DEPElevation(
  bounds: { north: number; south: number; east: number; west: number },
  width: number,
  height: number
): Promise<{ data: Float32Array; width: number; height: number } | null> {
  const w = Math.min(width, 2048);
  const h = Math.min(height, 2048);
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const url = `${USGS_3DEP_EXPORT}?bbox=${bbox}&bboxSR=4326&size=${w},${h}&imageSR=4326&format=png&f=image`;
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 60000,
    });
    const buf = Buffer.isBuffer(response.data)
      ? response.data
      : Buffer.from(response.data as ArrayBuffer);
    const img = await loadImage(buf);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const out = new Float32Array(img.width * img.height);
    const ELEV_MIN = -500;
    const ELEV_MAX = 6500;
    for (let i = 0; i < out.length; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];
      if (a === 0) {
        out[i] = NaN;
        continue;
      }
      const gray = (r + g + b) / 3;
      // 3DEP PNG: dark = high elev, light = low — invert so peaks are high in our mesh
      out[i] = ELEV_MAX - (gray / 255) * (ELEV_MAX - ELEV_MIN);
    }
    return { data: out, width: img.width, height: img.height };
  } catch (err) {
    console.warn("USGS 3DEP fetch failed, falling back to Terrarium:", err);
    return null;
  }
}

const USGS_STAC_BASE = "https://stac.astrogeology.usgs.gov/api/collections";
const PLANET_NODATA = -32767;

/**
 * Planetary STAC/GeoTIFF config. USGS planetary GeoTIFFs use Simple Cylindrical:
 * x = lon * (R*π/180), y = lat * (R*π/180) in meters.
 * Add entries here to enable STAC elevation for more bodies.
 */
const PLANET_STAC_CONFIG: Record<
  string,
  { collection: string; radiusM: number; label: string }
> = {
  moon: {
    collection: "kaguya_terrain_camera_usgs_dtms",
    radiusM: 1737400,
    label: "JAXA Kaguya TC DTMs",
  },
  // Mars: STAC (mro_ctx_controlled_usgs_dtms) has limited regional coverage.
  // Keep Mars on CARTO tiles only for now to avoid breaking existing behavior.
};

/** Venus: single global GeoTIFF (no STAC), NoData = -32768 */
const VENUS_MAGELLAN_URL =
  "https://planetarymaps.usgs.gov/mosaic/Venus_Magellan_Topography_Global_4641m_v02.tif";
const VENUS_RADIUS_M = 6_051_000;

function boundsToProjectedBbox(
  bounds: { west: number; south: number; east: number; north: number },
  radiusM: number
): [number, number, number, number] {
  const mPerDeg = (radiusM * Math.PI) / 180;
  return [
    bounds.west * mPerDeg,
    bounds.south * mPerDeg,
    bounds.east * mPerDeg,
    bounds.north * mPerDeg,
  ];
}

/**
 * Compute width/height for equirectangular elevation fetch (e.g. Venus GeoTIFF).
 * Uses physical aspect ratio (lonSpan*cos(lat) : latSpan) so the elevation grid
 * matches the mesh/model aspect ratio.
 */
function equirectangularDimensions(
  bounds: { north: number; south: number; east: number; west: number },
  maxDim: number = 2048,
  /** If set, correct for Mercator so selection aspect matches map display */
  centerLat?: number
): { width: number; height: number } {
  const latSpan = bounds.north - bounds.south;
  const lonSpan = bounds.east - bounds.west;
  let aspectRatio = lonSpan / Math.max(latSpan, 0.1);
  if (centerLat !== undefined) {
    const cosLat = Math.max(0.01, Math.cos((centerLat * Math.PI) / 180));
    aspectRatio = (lonSpan * cosLat) / Math.max(latSpan, 0.1);
  }
  let w: number;
  let h: number;
  if (aspectRatio >= 1) {
    w = maxDim;
    h = Math.max(2, Math.round(maxDim / aspectRatio));
  } else {
    h = maxDim;
    w = Math.max(2, Math.round(maxDim * aspectRatio));
  }
  return { width: w, height: h };
}

/**
 * Fetch elevation from USGS STAC planetary DTMs (Moon, Mars, etc.).
 * Uses STAC to find DTMs, reads COGs via geotiff.js.
 * Returns { data, width, height } in meters, or null on failure.
 */
async function fetchPlanetaryStacElevation(
  planet: "moon" | "mars",
  bounds: { north: number; south: number; east: number; west: number },
  width: number,
  height: number
): Promise<{ data: Float32Array; width: number; height: number } | null> {
  const config = PLANET_STAC_CONFIG[planet];
  if (!config) return null;

  const w = Math.min(width, 2048);
  const h = Math.min(height, 2048);
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const stacUrl = `${USGS_STAC_BASE}/${config.collection}/items`;

  try {
    const stacRes = await axios.get<{
      features?: Array<{
        assets?: { dtm?: { href?: string } };
      }>;
    }>(`${stacUrl}?bbox=${bbox}&limit=15`, { timeout: 15000 });

    const features = stacRes.data?.features ?? [];
    if (features.length === 0) {
      console.warn(`No STAC DTMs found for ${planet}, falling back to CARTO tiles.`);
      return null;
    }

    const out = new Float32Array(w * h);
    const count = new Float32Array(w * h);
    out.fill(NaN);
    count.fill(0);

    const bboxArr = boundsToProjectedBbox(bounds, config.radiusM);

    for (const feat of features) {
      const href = feat.assets?.dtm?.href;
      if (!href) continue;

      try {
        const { fromUrl } = await import("geotiff");
        const tiff = await fromUrl(href, { maxRanges: 64 });
        const rasters = await tiff.readRasters({
          bbox: bboxArr,
          width: w,
          height: h,
          samples: [0],
          interleave: false,
        });
        const arr = (Array.isArray(rasters) ? rasters[0] : rasters) as
          | Float32Array
          | Int16Array
          | Uint16Array;
        if (!arr || arr.length !== w * h) continue;

        for (let i = 0; i < arr.length; i++) {
          const v = arr[i] as number;
          if (
            Number.isFinite(v) &&
            v !== PLANET_NODATA &&
            v < 1e6 &&
            v > -1e6
          ) {
            const prev = Number.isFinite(out[i]) ? out[i]! : 0;
            out[i] = prev + v;
            count[i]++;
          }
        }
      } catch (e) {
        console.warn(`STAC DTM fetch failed for ${planet}:`, e);
      }
    }

    for (let i = 0; i < out.length; i++) {
      if (count[i] > 0) {
        out[i] = out[i]! / count[i];
      } else {
        out[i] = NaN;
      }
    }

    const hasData = count.some((c) => c > 0);
    if (!hasData) {
      console.warn(`No valid STAC elevation in bounds for ${planet}, falling back to CARTO tiles.`);
      return null;
    }

    console.log(`${planet} elevation from ${config.label} (true elevation)`);
    return { data: out, width: w, height: h };
  } catch (err) {
    console.warn(`STAC fetch failed for ${planet}, falling back to CARTO tiles:`, err);
    return null;
  }
}

/**
 * Fetch elevation from Venus Magellan global GeoTIFF (no STAC).
 * Simple Cylindrical projection, same CRS as Moon.
 */
async function fetchVenusMagellanElevation(
  bounds: { north: number; south: number; east: number; west: number },
  width: number,
  height: number
): Promise<{ data: Float32Array; width: number; height: number } | null> {
  const w = Math.min(width, 2048);
  const h = Math.min(height, 2048);
  const bboxArr = boundsToProjectedBbox(bounds, VENUS_RADIUS_M);
  try {
    const { fromUrl } = await import("geotiff");
    const tiff = await fromUrl(VENUS_MAGELLAN_URL, { maxRanges: 64 });
    const rasters = await tiff.readRasters({
      bbox: bboxArr,
      width: w,
      height: h,
      samples: [0],
      interleave: false,
    });
    const arr = (Array.isArray(rasters) ? rasters[0] : rasters) as
      | Float32Array
      | Int16Array
      | Uint16Array;
    if (!arr || arr.length !== w * h) return null;

    const out = new Float32Array(w * h);
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i] as number;
      if (
        Number.isFinite(v) &&
        v !== -32768 &&
        v !== PLANET_NODATA &&
        v < 1e6 &&
        v > -1e6
      ) {
        out[i] = v;
      } else {
        out[i] = NaN;
      }
    }
    console.log("Venus elevation from Magellan Global Topography (true elevation)");
    return { data: out, width: w, height: h };
  } catch (err) {
    console.warn("Venus Magellan fetch failed:", err);
    return null;
  }
}

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

export type ElevationSource = "usgs3dep" | "terrarium" | "mars" | "moon" | "venus";

export class TerrainGenerator {
  private options: TerrainOptions;
  public fallbackTriggered: boolean = false;
  /** Which elevation data source was used (for UI credit/attribution). */
  public elevationSource: ElevationSource = "terrarium";
  /** True when Moon used JAXA Kaguya TC DTMs (vs CARTO fallback). */
  public moonUsedKaguya: boolean = false;

  constructor(options: TerrainOptions) {
    this.options = options;
    this.elevationSource =
      options.planet === "mars"
        ? "mars"
        : options.planet === "moon"
          ? "moon"
          : options.planet === "venus"
            ? "venus"
            : "terrarium";
  }

  private static readonly RESOLUTION_ORDER: TerrainOptions["resolution"][] = [
    "low",
    "medium",
    "high",
    "ultra",
  ];
  private static readonly ZOOM_BY_RES: Record<
    TerrainOptions["resolution"],
    number
  > = { low: 11, medium: 12, high: 13, ultra: 14 };
  private static readonly SEGMENTS_BY_RES: Record<
    TerrainOptions["resolution"],
    number
  > = { low: 128, medium: 256, high: 384, ultra: 1024 };

  private getZoomLevel(): number {
    return TerrainGenerator.ZOOM_BY_RES[this.options.resolution] ?? 12;
  }

  /**
   * Build list of (zoom, maxSegments) to try: start with requested resolution,
   * then progressively lower resolution and zoom so we deliver an STL when possible.
   */
  private getFallbackAttempts(): { zoom: number; maxSegments: number }[] {
    const res = this.options.resolution;
    const idx = TerrainGenerator.RESOLUTION_ORDER.indexOf(res);
    const attempts: { zoom: number; maxSegments: number }[] = [];
    const MIN_ZOOM = 5;
    for (let r = idx; r >= 0; r--) {
      const resolution = TerrainGenerator.RESOLUTION_ORDER[r];
      const maxSegments = TerrainGenerator.SEGMENTS_BY_RES[resolution];
      const startZoom = TerrainGenerator.ZOOM_BY_RES[resolution];
      for (let z = startZoom; z >= MIN_ZOOM; z--) {
        attempts.push({ zoom: z, maxSegments });
      }
    }
    return attempts;
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

    const attempts = this.getFallbackAttempts();
    let lastError: Error | null = null;

    for (const { zoom: tryZoom, maxSegments: tryMaxSegments } of attempts) {
      try {
        const buffer = await this.generateAtResolution(tryZoom, tryMaxSegments);
        if (
          tryZoom < this.getZoomLevel() ||
          tryMaxSegments <
            TerrainGenerator.SEGMENTS_BY_RES[this.options.resolution]
        ) {
          this.fallbackTriggered = true;
        }
        return buffer;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `Terrain attempt failed (zoom=${tryZoom}, segments=${tryMaxSegments}), trying lower resolution:`,
          lastError.message
        );
      }
    }

    throw lastError ?? new Error("Could not generate terrain for this area.");
  }

  /**
   * One attempt at generating STL with the given zoom and max mesh segments.
   * May throw if tiles fail or no vertices are generated.
   */
  private async generateAtResolution(
    zoom: number,
    maxSegments: number
  ): Promise<Buffer> {
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

    // Calculate dimensions
    let xMin = long2tile(bounds.west, zoom);
    let xMax = long2tile(bounds.east, zoom);
    let yMin = lat2tile(bounds.north, zoom);
    let yMax = lat2tile(bounds.south, zoom);

    const MAX_PIXELS = 4096;
    let width = (xMax - xMin + 1) * 256;
    let height = (yMax - yMin + 1) * 256;

    let actualZoom = zoom;
    while ((width > MAX_PIXELS || height > MAX_PIXELS) && actualZoom > 5) {
      actualZoom--;
      xMin = long2tile(bounds.west, actualZoom);
      xMax = long2tile(bounds.east, actualZoom);
      yMin = lat2tile(bounds.north, actualZoom);
      yMax = lat2tile(bounds.south, actualZoom);
      width = (xMax - xMin + 1) * 256;
      height = (yMax - yMin + 1) * 256;
    }

    console.log(
      `Grid: X[${xMin}-${xMax}] Y[${yMin}-${yMax}] Zoom: ${actualZoom}`
    );

    const latSpan = bounds.north - bounds.south;
    const lonSpan = bounds.east - bounds.west;
    const centerLat = (bounds.north + bounds.south) / 2;
    // Physical aspect: at latitude φ, 1° lon = 111*cos(φ) km, 1° lat ≈ 111 km.
    // So width:height = (lonSpan*cos(φ)) : latSpan.
    const cosLat = Math.max(0.01, Math.cos((centerLat * Math.PI) / 180));
    const aspectRatio = (lonSpan * cosLat) / Math.max(latSpan, 0.1);

    // Ensure at least 2x2 so we always get quads and a valid watertight mesh
    const segmentsX = Math.max(2, Math.min(width, maxSegments));
    const segmentsY = Math.max(2, Math.round(segmentsX / aspectRatio));

    const modelHeight = modelWidth / aspectRatio;

    console.log(
      `Mesh Grid: ${segmentsX}x${segmentsY}, Model Size: ${modelWidth}x${modelHeight}`
    );

    // Earth: use Terrarium tiles only. Raw RGB-encoded elevation (meters) — no display-image guesswork.
    // (3DEP PNG export is a rendered image; interpreting it as elevation produced wrong/spiky terrain.)
    // Moon: prefer JAXA Kaguya TC DTMs (true elevation) over CARTO hillshaded albedo.
    // Mars: unchanged – CARTO opm-mars-basemap-v0-1 only.
    let usgsElev: Float32Array | null = null;
    let usgsWidth = 0;
    let usgsHeight = 0;

    if (planet === "moon") {
      const stacElev = await fetchPlanetaryStacElevation(planet, bounds, width, height);
      if (stacElev) {
        usgsElev = stacElev.data;
        usgsWidth = stacElev.width;
        usgsHeight = stacElev.height;
        this.moonUsedKaguya = true;
      }
    } else if (planet === "venus") {
      // Venus GeoTIFF is equirectangular; use aspect ratio matching Mercator-corrected model
      const { width: elevW, height: elevH } = equirectangularDimensions(bounds, 2048, centerLat);
      const venusElev = await fetchVenusMagellanElevation(bounds, elevW, elevH);
      if (venusElev) {
        usgsElev = venusElev.data;
        usgsWidth = venusElev.width;
        usgsHeight = venusElev.height;
      } else {
        throw new Error("Could not load Venus Magellan elevation data. The service may be unavailable.");
      }
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    if (!usgsElev) {
      const tilePromises = [];
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          tilePromises.push(
            this.loadTile(x, y, actualZoom, x - xMin, y - yMin, ctx, planet)
          );
        }
      }
      await Promise.all(tilePromises);
      console.log("All tiles loaded");
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const vertices: number[] = [];
    const indices: number[] = [];

    const getElevation = (col: number, row: number): number | null => {
      if (usgsElev && usgsWidth > 0 && usgsHeight > 0) {
        const imgX = Math.floor(
          (col / Math.max(1, segmentsX - 1)) * (usgsWidth - 1)
        );
        const imgY = Math.floor(
          (row / Math.max(1, segmentsY - 1)) * (usgsHeight - 1)
        );
        const idx = imgY * usgsWidth + imgX;
        if (idx < 0 || idx >= usgsElev.length) return null;
        const v = usgsElev[idx];
        return Number.isFinite(v) ? v : null;
      }

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
      }
      return decodeElevationPlanetary(r, g, b);
    };

    // Build elevation grid and collect valid values for robust range (percentile-based to ignore outliers)
    const elevGrid = new Float32Array(segmentsX * segmentsY);
    elevGrid.fill(NaN);
    const validElevs: number[] = [];

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
        if (elev !== null && Number.isFinite(elev)) {
          const i = y * segmentsX + x;
          elevGrid[i] = elev;
          validElevs.push(elev);
        }
      }
    }

    let minElev: number;
    let maxElev: number;

    if (validElevs.length === 0) {
      console.warn("No valid elevation points found. Using default flat terrain.");
      minElev = 0;
      maxElev = 100;
    } else {
      minElev = Math.min(...validElevs);
      maxElev = Math.max(...validElevs);
      console.log(
        `Elevation Range: ${minElev.toFixed(0)} to ${maxElev.toFixed(0)} m (full range; ${validElevs.length} points)`
      );
      // No percentile clamping – use full range so summits (e.g. Timp ~3581 m) aren't cut off

      // 3x3 median – removes single-pixel spikes, keeps terrain detail
      const runMedian = (src: Float32Array, dst: Float32Array, r: number) => {
        const win: number[] = [];
        for (let y = 0; y < segmentsY; y++) {
          for (let x = 0; x < segmentsX; x++) {
            const i = y * segmentsX + x;
            if (!Number.isFinite(src[i])) continue;
            win.length = 0;
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < segmentsX && ny >= 0 && ny < segmentsY) {
                  const v = src[ny * segmentsX + nx];
                  if (Number.isFinite(v)) win.push(v);
                }
              }
            }
            if (win.length > 0) {
              win.sort((a, b) => a - b);
              dst[i] = win[Math.floor(win.length / 2)];
            }
          }
        }
      };
      const medianPass = new Float32Array(elevGrid.length);
      medianPass.set(elevGrid);
      runMedian(elevGrid, medianPass, 1);
      for (let i = 0; i < elevGrid.length; i++) elevGrid[i] = medianPass[i];
      // Moon with CARTO fallback: tiles are hillshaded albedo (shadows = fake spikes). Extra 3x3 helps.
      // When using Kaguya (usgsElev set), we have real elevation – no extra smoothing.
      if (planet === "moon" && !usgsElev) {
        runMedian(elevGrid, medianPass, 1);
        for (let i = 0; i < elevGrid.length; i++) elevGrid[i] = medianPass[i];
      }
    }

    const metersPerDegreeLon = 111132.954 * cosLat;
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

    const gridMap = new Int32Array(segmentsX * segmentsY).fill(-1);

    const elevationRange = maxElev - minElev || 1;

    // Generate Top Surface (use clamped + smoothed elevation grid)
    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        if (shape === "oval") {
          const cx = (segmentsX - 1) / 2;
          const cy = (segmentsY - 1) / 2;
          const dx = (x - cx) / cx;
          const dy = (y - cy) / cy;
          if (dx * dx + dy * dy > 1.0) continue;
        }

        const idx = y * segmentsX + x;
        let elev = Number.isFinite(elevGrid[idx]) ? elevGrid[idx] : minElev;

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

    const triangleCount = indices.length / 3;
    if (triangleCount === 0) {
      throw new Error(
        "No mesh triangles generated. Try a larger area, rectangle shape, or different location."
      );
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
      } else if (planet === "venus") {
        // Venus: no OPM tiles; use dark placeholder basemap for display coherence
        url = `https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/${z}/${x}/${y}.png`;
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
