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
  modelWidth: number; // in mm
  resolution: "low" | "medium" | "high" | "ultra";
  shape: "rectangle" | "oval";
  planet: "earth" | "mars" | "moon";
  lithophane: boolean; // New option
  invert: boolean;     // New option
}

// AWS Terrarium encoding: (r * 256 + g + b / 256) - 32768
const decodeElevationEarth = (r: number, g: number, b: number): number => {
  return (r * 256 + g + b / 256) - 32768;
};

// Simple grayscale decoding for Moon/Mars
const decodeElevationPlanetary = (r: number, g: number, b: number): number => {
  const val = (r + g + b) / 3;
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

  private getZoomLevel(): number {
    switch (this.options.resolution) {
      case "low": return 11;
      case "medium": return 12;
      case "high": return 13;
      case "ultra": return 14;
      default: return 12;
    }
  }

  async generate(): Promise<Blob> {
    console.log("Starting Terrain Generation", this.options);
    const { bounds, exaggeration, baseHeight, modelWidth, shape, planet, lithophane, invert } = this.options;
    const zoom = this.getZoomLevel();

    const xMin = long2tile(bounds.west, zoom);
    const xMax = long2tile(bounds.east, zoom);
    const yMin = lat2tile(bounds.north, zoom);
    const yMax = lat2tile(bounds.south, zoom);

    console.log(`Grid: X[${xMin}-${xMax}] Y[${yMin}-${yMax}] Zoom: ${zoom}`);

    const canvas = document.createElement("canvas");
    const tileSize = 256;
    const width = (xMax - xMin + 1) * tileSize;
    const height = (yMax - yMin + 1) * tileSize;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    
    if (!ctx) throw new Error("Could not create canvas context");

    const tilePromises = [];
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tilePromises.push(this.loadTile(x, y, zoom, x - xMin, y - yMin, ctx, planet));
      }
    }
    
    await Promise.all(tilePromises);
    console.log("All tiles loaded");

    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (e) {
      console.error("Error getting image data (likely CORS):", e);
      throw new Error("Security Error: Unable to read map data.");
    }
    const data = imageData.data;
    console.log(`Image Data size: ${data.length}, W: ${width}, H: ${height}`);

    const latSpan = bounds.north - bounds.south;
    const lonSpan = bounds.east - bounds.west;
    const aspectRatio = lonSpan / latSpan;

    const segmentsX = Math.min(width, 256);
    const segmentsY = Math.round(segmentsX / aspectRatio);

    const modelHeight = modelWidth / aspectRatio;
    
    console.log(`Mesh Grid: ${segmentsX}x${segmentsY}, Model Size: ${modelWidth}x${modelHeight}`);

    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];

    const getElevation = (col: number, row: number) => {
      const imgX = Math.floor((col / (segmentsX - 1)) * (width - 1));
      const imgY = Math.floor((row / (segmentsY - 1)) * (height - 1));
      
      const index = (imgY * width + imgX) * 4;
      // Safety check for index out of bounds
      if (index < 0 || index >= data.length) return 0;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      
      if (planet === 'earth') {
        return decodeElevationEarth(r, g, b);
      } else {
        return decodeElevationPlanetary(r, g, b);
      }
    };

    let minElev = Infinity;
    let maxElev = -Infinity;

    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        if (shape === 'oval') {
           const cx = (segmentsX - 1) / 2;
           const cy = (segmentsY - 1) / 2;
           const dx = (x - cx) / cx;
           const dy = (y - cy) / cy;
           if (dx*dx + dy*dy > 1.0) continue;
        }
        
        const elev = getElevation(x, y);
        if (elev < minElev) minElev = elev;
        if (elev > maxElev) maxElev = elev;
      }
    }
    
    // Fallback if no valid elevation found (e.g. all masked out or data error)
    if (minElev === Infinity || maxElev === -Infinity) {
        minElev = 0;
        maxElev = 100;
    }
    
    console.log(`Elevation Range: ${minElev} to ${maxElev}`);

    const centerLat = (bounds.north + bounds.south) / 2;
    const metersPerDegreeLon = 111132.954 * Math.cos(centerLat * Math.PI / 180);
    const realWidthMeters = lonSpan * metersPerDegreeLon;
    let scale = modelWidth / realWidthMeters; 

    if (planet !== 'earth') {
       const elevRange = maxElev - minElev;
       if (elevRange === 0) scale = 1;
       else {
           const targetRelief = modelWidth * 0.15; 
           scale = targetRelief / elevRange;
       }
    }

    // Lithophane Settings
    // If lithophane, we map minElev->maxElev to minThickness->maxThickness
    // Typically minThickness=0.8mm, maxThickness=3.0mm
    const minThickness = 0.8;
    const maxThickness = 4.0;
    const thicknessRange = maxThickness - minThickness;
    const elevationRange = maxElev - minElev || 1;

    const gridMap = new Int32Array(segmentsX * segmentsY).fill(-1);

    // Generate Top Surface
    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        
        if (shape === 'oval') {
           const cx = (segmentsX - 1) / 2;
           const cy = (segmentsY - 1) / 2;
           const dx = (x - cx) / cx;
           const dy = (y - cy) / cy;
           if (dx*dx + dy*dy > 1.0) continue; 
        }

        let elev = getElevation(x, y);
        let z = 0;

        if (lithophane) {
            // Normalize elevation 0..1
            let norm = (elev - minElev) / elevationRange;
            if (invert) norm = 1.0 - norm; // Invert: Low points = Thick, High points = Thin
            
            // Map to thickness
            // Z = Thickness. Bottom is at Z=0. Top is at Z=Thickness.
            z = minThickness + (norm * thicknessRange);
        } else {
            // Standard Terrain
            // Apply Invert if requested (e.g. for molds)
            if (invert) elev = -elev;
            z = (elev - minElev) * exaggeration * scale + baseHeight;
        }

        const px = (x / (segmentsX - 1)) * modelWidth - (modelWidth / 2);
        const py = -((y / (segmentsY - 1)) * modelHeight - (modelHeight / 2));

        vertices.push(px, py, z);
        gridMap[y * segmentsX + x] = (vertices.length / 3) - 1;
      }
    }

    const numTopVertices = vertices.length / 3;
    console.log(`Generated ${numTopVertices} vertices for top surface`);

    if (numTopVertices === 0) {
        throw new Error("No vertices generated. Check selection bounds and shape.");
    }

    // Generate Bottom Surface (Flat at Z=0)
    for (let i = 0; i < numTopVertices; i++) {
        vertices.push(vertices[i*3], vertices[i*3+1], 0);
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

    // Bottom Surface (Winding reversed)
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

        const isCellValid = (tl !== -1 && tr !== -1 && br !== -1 && bl !== -1);

        if (isCellValid) {
            // Top Neighbor
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

            // Bottom Neighbor
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

            // Left Neighbor
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

            // Right Neighbor
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
    console.log("Mesh created, starting export...");
    
    const exporter = new STLExporter();
    const result = exporter.parse(mesh, { binary: true });
    
    if (result instanceof DataView) {
        console.log(`STL Export successful, size: ${result.byteLength}`);
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
        img.src = `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-1/all/${z}/${x}/${y}.png`;
      } else if (planet === 'moon') {
        img.src = `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/${z}/${x}/${y}.png`;
      } else {
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
