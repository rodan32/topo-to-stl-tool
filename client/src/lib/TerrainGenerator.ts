import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

interface TerrainOptions {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  exaggeration: number;
  baseHeight: number;
  modelWidth: number; // New option in mm
  resolution: "low" | "medium" | "high" | "ultra";
  shape: "rectangle" | "oval";
  planet: "earth" | "mars" | "moon";
}

// AWS Terrarium encoding: (r * 256 + g + b / 256) - 32768
const decodeElevationEarth = (r: number, g: number, b: number): number => {
  return (r * 256 + g + b / 256) - 32768;
};

// Simple grayscale decoding for Moon/Mars (assuming brightness = height)
// We need to calibrate this based on the source.
// MOLA (Mars) and LOLA (Moon) usually map grayscale to a range.
// For now, we'll assume a normalized 0-255 range maps to a generic 0-10000m relative height for visual shape,
// as exact absolute elevation requires specific metadata per tile which we don't have.
// However, to make it printable, relative shape is what matters.
const decodeElevationPlanetary = (r: number, g: number, b: number): number => {
  // Use average of RGB for grayscale value
  const val = (r + g + b) / 3;
  // Map 0-255 to approx 0-20000m range (just a guess to get reasonable mountains)
  return val * 100; 
};

// Calculate tile coordinates from lat/lon and zoom
const long2tile = (lon: number, zoom: number) => {
  return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
};

const lat2tile = (lat: number, zoom: number) => {
  return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
};

export class TerrainGenerator {
  private options: TerrainOptions;
  
  constructor(options: TerrainOptions) {
    this.options = options;
  }

  // Get zoom level based on resolution setting
  private getZoomLevel(): number {
    switch (this.options.resolution) {
      case "low": return 11;
      case "medium": return 12;
      case "high": return 13;
      case "ultra": return 14;
      default: return 12;
    }
  }

  // Generate the STL file
  async generate(): Promise<Blob> {
    console.log("Starting Terrain Generation", this.options);
    const { bounds, exaggeration, baseHeight, modelWidth, shape, planet } = this.options;
    const zoom = this.getZoomLevel();

    // Calculate tile range
    const xMin = long2tile(bounds.west, zoom);
    const xMax = long2tile(bounds.east, zoom);
    const yMin = lat2tile(bounds.north, zoom);
    const yMax = lat2tile(bounds.south, zoom);

    console.log(`Tiles: X[${xMin}-${xMax}], Y[${yMin}-${yMax}], Zoom: ${zoom}`);

    // Canvas to draw tiles onto
    const canvas = document.createElement("canvas");
    const tileSize = 256;
    const width = (xMax - xMin + 1) * tileSize;
    const height = (yMax - yMin + 1) * tileSize;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    
    if (!ctx) throw new Error("Could not create canvas context");

    console.log(`Canvas Size: ${width}x${height}`);

    // Fetch and draw tiles
    const tilePromises = [];
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tilePromises.push(this.loadTile(x, y, zoom, x - xMin, y - yMin, ctx, planet));
      }
    }
    
    await Promise.all(tilePromises);
    console.log("All tiles loaded/processed");

    // Get image data
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (e) {
      console.error("Error getting image data (likely CORS):", e);
      throw new Error("Security Error: Unable to read map data. This is likely a CORS issue with the tile server.");
    }
    const data = imageData.data;

    // Create geometry
    // Calculate aspect ratio of the selected area
    const latSpan = bounds.north - bounds.south;
    const lonSpan = bounds.east - bounds.west;
    const aspectRatio = lonSpan / latSpan;

    console.log(`Aspect Ratio: ${aspectRatio}`);

    const segmentsX = Math.min(width, 256); // Limit vertices for browser performance
    const segmentsY = Math.round(segmentsX / aspectRatio);

    console.log(`Mesh Segments: ${segmentsX}x${segmentsY}`);

    // Use user-defined modelWidth (mm)
    // Height (mm) = Width / AspectRatio
    const modelHeight = modelWidth / aspectRatio;

    // We will build a custom geometry manually
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];

    // Helper to get elevation at grid coords (0..segmentsX-1, 0..segmentsY-1)
    const getElevation = (col: number, row: number) => {
      const imgX = Math.floor((col / (segmentsX - 1)) * (width - 1));
      const imgY = Math.floor((row / (segmentsY - 1)) * (height - 1));
      
      const index = (imgY * width + imgX) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      
      if (planet === 'earth') {
        return decodeElevationEarth(r, g, b);
      } else {
        return decodeElevationPlanetary(r, g, b);
      }
    };

    // 1. Calculate Min/Max Elevation for scaling
    let minElev = Infinity;
    let maxElev = -Infinity;

    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        // If oval, check if point is inside ellipse
        if (shape === 'oval') {
           const cx = (segmentsX - 1) / 2;
           const cy = (segmentsY - 1) / 2;
           const dx = (x - cx) / cx;
           const dy = (y - cy) / cy;
           if (dx*dx + dy*dy > 1.0) continue; // Skip outside points
        }
        
        const elev = getElevation(x, y);
        if (elev < minElev) minElev = elev;
        if (elev > maxElev) maxElev = elev;
      }
    }
    console.log(`Elevation Range: ${minElev}m to ${maxElev}m`);

    // Scale factors
    const centerLat = (bounds.north + bounds.south) / 2;
    const metersPerDegreeLon = 111132.954 * Math.cos(centerLat * Math.PI / 180);
    const realWidthMeters = lonSpan * metersPerDegreeLon;
    const scale = modelWidth / realWidthMeters; // mm per meter

    // For planetary, since we don't have real meters, we normalize to a visually pleasing range
    // If planet != earth, we ignore realWidthMeters and just map min-max to a reasonable Z-height relative to width
    // e.g. Max height = 10% of width * exaggeration
    let finalScale = scale;
    if (planet !== 'earth') {
       const elevRange = maxElev - minElev;
       if (elevRange === 0) finalScale = 1;
       else {
           // Target a base relief of ~15mm for 100mm width at 1x exaggeration
           const targetRelief = modelWidth * 0.15; 
           finalScale = targetRelief / elevRange;
       }
    }

    // 2. Generate Vertices & Indices
    // We need a map from (x,y) to vertexIndex because oval shape skips points
    const gridMap = new Int32Array(segmentsX * segmentsY).fill(-1);

    // Generate Top Surface Vertices
    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        
        // Oval Check
        if (shape === 'oval') {
           const cx = (segmentsX - 1) / 2;
           const cy = (segmentsY - 1) / 2;
           const dx = (x - cx) / cx;
           const dy = (y - cy) / cy;
           if (dx*dx + dy*dy > 1.0) continue; 
        }

        const elev = getElevation(x, y);
        const z = (elev - minElev) * exaggeration * finalScale + baseHeight;

        // Position centered at 0,0
        const px = (x / (segmentsX - 1)) * modelWidth - (modelWidth / 2);
        const py = -((y / (segmentsY - 1)) * modelHeight - (modelHeight / 2));

        vertices.push(px, py, z);
        gridMap[y * segmentsX + x] = (vertices.length / 3) - 1;
      }
    }

    const numTopVertices = vertices.length / 3;

    // Generate Bottom Surface Vertices (Same X,Y, but Z=0)
    for (let i = 0; i < numTopVertices; i++) {
        vertices.push(vertices[i*3], vertices[i*3+1], 0);
    }

    // 3. Generate Triangles
    const addQuad = (v1: number, v2: number, v3: number, v4: number) => {
        indices.push(v1, v4, v2);
        indices.push(v2, v4, v3);
    };

    // Top Surface
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const idx1 = gridMap[y * segmentsX + x];           // TL
        const idx2 = gridMap[y * segmentsX + x + 1];       // TR
        const idx3 = gridMap[(y + 1) * segmentsX + x + 1]; // BR
        const idx4 = gridMap[(y + 1) * segmentsX + x];     // BL

        if (idx1 !== -1 && idx2 !== -1 && idx3 !== -1 && idx4 !== -1) {
             addQuad(idx1, idx2, idx3, idx4);
        }
      }
    }

    // Bottom Surface (Winding reversed)
    const offset = numTopVertices;
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const idx1 = gridMap[y * segmentsX + x];           // TL
        const idx2 = gridMap[y * segmentsX + x + 1];       // TR
        const idx3 = gridMap[(y + 1) * segmentsX + x + 1]; // BR
        const idx4 = gridMap[(y + 1) * segmentsX + x];     // BL

        if (idx1 !== -1 && idx2 !== -1 && idx3 !== -1 && idx4 !== -1) {
             indices.push(offset + idx1, offset + idx2, offset + idx4);
             indices.push(offset + idx2, offset + idx3, offset + idx4);
        }
      }
    }

    // Wall Generation (Robust Method)
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const tl = gridMap[y * segmentsX + x];
        const tr = gridMap[y * segmentsX + x + 1];
        const br = gridMap[(y + 1) * segmentsX + x + 1];
        const bl = gridMap[(y + 1) * segmentsX + x];

        const isCellValid = (tl !== -1 && tr !== -1 && br !== -1 && bl !== -1);

        if (isCellValid) {
            // 1. Top Neighbor (y-1)
            let topValid = false;
            if (y > 0) {
                const n_bl = gridMap[(y - 1 + 1) * segmentsX + x]; 
                const n_br = gridMap[(y - 1 + 1) * segmentsX + x + 1]; 
                const n_tl = gridMap[(y - 1) * segmentsX + x];
                const n_tr = gridMap[(y - 1) * segmentsX + x + 1];
                if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1) topValid = true;
            }
            if (!topValid) {
                indices.push(tl, offset + tr, offset + tl); 
                indices.push(tl, tr, offset + tr); 
            }

            // 2. Bottom Neighbor (y+1)
            let botValid = false;
            if (y < segmentsY - 2) {
                const n_tl = gridMap[(y + 1) * segmentsX + x]; 
                const n_tr = gridMap[(y + 1) * segmentsX + x + 1]; 
                const n_bl = gridMap[(y + 2) * segmentsX + x];
                const n_br = gridMap[(y + 2) * segmentsX + x + 1];
                if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1) botValid = true;
            }
            if (!botValid) {
                indices.push(br, bl, offset + bl);
                indices.push(br, offset + bl, offset + br);
            }

            // 3. Left Neighbor (x-1)
            let leftValid = false;
            if (x > 0) {
                const n_tr = gridMap[y * segmentsX + x - 1 + 1]; 
                const n_br = gridMap[(y + 1) * segmentsX + x - 1 + 1]; 
                const n_tl = gridMap[y * segmentsX + x - 1];
                const n_bl = gridMap[(y + 1) * segmentsX + x - 1];
                if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1) leftValid = true;
            }
            if (!leftValid) {
                indices.push(bl, tl, offset + tl);
                indices.push(bl, offset + tl, offset + bl);
            }

            // 4. Right Neighbor (x+1)
            let rightValid = false;
            if (x < segmentsX - 2) {
                const n_tl = gridMap[y * segmentsX + x + 1]; 
                const n_bl = gridMap[(y + 1) * segmentsX + x + 1]; 
                const n_tr = gridMap[y * segmentsX + x + 2];
                const n_br = gridMap[(y + 1) * segmentsX + x + 2];
                if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1) rightValid = true;
            }
            if (!rightValid) {
                indices.push(tr, br, offset + br);
                indices.push(tr, offset + br, offset + tr);
            }
        }
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    
    console.log("Mesh created. Vertices:", vertices.length / 3, "Triangles:", indices.length / 3);

    // Export
    const exporter = new STLExporter();
    const result = exporter.parse(mesh, { binary: true });
    
    if (result instanceof DataView) {
        console.log("STL Size:", result.byteLength);
        return new Blob([result], { type: 'application/octet-stream' });
    } else {
        throw new Error("Failed to export STL");
    }
  }

  private loadTile(x: number, y: number, z: number, offsetX: number, offsetY: number, ctx: CanvasRenderingContext2D, planet: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      
      if (planet === 'mars') {
        // Mars MOLA (OpenPlanetary / NASA)
        // Using a reliable public MOLA tileset (Carto/OpenPlanetary)
        // Note: These are often visual. Ideally we need raw DEM. 
        // For this demo, we use the "Shaded Relief" which is grayscale-ish and correlates to height.
        img.src = `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-1/all/${z}/${x}/${y}.png`;
      } else if (planet === 'moon') {
        // Moon LRO (OpenPlanetary / NASA)
        img.src = `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/${z}/${x}/${y}.png`;
      } else {
        // Earth (AWS Terrarium)
        img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      }
      
      img.onload = () => {
        ctx.drawImage(img, offsetX * 256, offsetY * 256);
        resolve();
      };
      
      img.onerror = () => {
        console.error(`Failed to load tile ${z}/${x}/${y}`);
        resolve();
      };
    });
  }
}
