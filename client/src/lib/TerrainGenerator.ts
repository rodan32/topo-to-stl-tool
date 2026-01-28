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
}

// AWS Terrarium encoding: (r * 256 + g + b / 256) - 32768
const decodeElevation = (r: number, g: number, b: number): number => {
  return (r * 256 + g + b / 256) - 32768;
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
    const { bounds, exaggeration, baseHeight, modelWidth, shape } = this.options;
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
        tilePromises.push(this.loadTile(x, y, zoom, x - xMin, y - yMin, ctx));
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

    const geometry = new THREE.PlaneGeometry(modelWidth, modelHeight, segmentsX - 1, segmentsY - 1);
    const vertices = geometry.attributes.position.array;

    // Apply elevation to vertices
    let minElev = Infinity;
    let maxElev = -Infinity;
    
    // First pass: find minimum elevation
    for (let i = 0; i < vertices.length; i += 3) {
      const col = (i / 3) % segmentsX;
      const row = Math.floor((i / 3) / segmentsX);
      
      const imgX = Math.floor((col / (segmentsX - 1)) * (width - 1));
      const imgY = Math.floor((row / (segmentsY - 1)) * (height - 1));
      
      const index = (imgY * width + imgX) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      
      const elev = decodeElevation(r, g, b);
      if (elev < minElev) minElev = elev;
      if (elev > maxElev) maxElev = elev;
    }

    console.log(`Elevation Range: ${minElev}m to ${maxElev}m`);

    // Second pass: set z-height relative to minimum + base
    for (let i = 0; i < vertices.length; i += 3) {
      const col = (i / 3) % segmentsX;
      const row = Math.floor((i / 3) / segmentsX);
      
      const imgX = Math.floor((col / (segmentsX - 1)) * (width - 1));
      const imgY = Math.floor((row / (segmentsY - 1)) * (height - 1));
      
      const index = (imgY * width + imgX) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      
      const elev = decodeElevation(r, g, b);
      
      const centerLat = (bounds.north + bounds.south) / 2;
      const metersPerDegreeLon = 111132.954 * Math.cos(centerLat * Math.PI / 180);
      
      const realWidthMeters = lonSpan * metersPerDegreeLon;
      
      // Scale calculation:
      // modelWidth (mm) corresponds to realWidthMeters (m)
      // We want to convert elevation (m) to model units (mm)
      // Scale factor = modelWidth / realWidthMeters
      const scale = modelWidth / realWidthMeters;
      
      // Z (mm) = (Elevation (m) - MinElev (m)) * Exaggeration * Scale + BaseHeight (mm)
      // Note: Scale is (mm / m). So m * (mm/m) = mm. Correct.
      
      vertices[i + 2] = (elev - minElev) * exaggeration * scale + baseHeight; 
    }

    // Constructing a solid mesh with correct winding order
    const solidGeo = new THREE.BufferGeometry();
    const numPoints = segmentsX * segmentsY;
    
    // Vertices: Top grid + Bottom grid
    const solidVertices = new Float32Array(numPoints * 3 * 2); 
    
    // Copy top vertices
    for (let i = 0; i < vertices.length; i++) {
      solidVertices[i] = vertices[i];
    }
    
    // Create bottom vertices (same x,y, but z=0)
    for (let i = 0; i < vertices.length; i += 3) {
      solidVertices[numPoints * 3 + i] = vertices[i];     // x
      solidVertices[numPoints * 3 + i + 1] = vertices[i+1]; // y
      solidVertices[numPoints * 3 + i + 2] = 0;           // z
    }
    
    solidGeo.setAttribute('position', new THREE.BufferAttribute(solidVertices, 3));
    
    // Indices
    const indices = [];
    
    // Top surface (Points Up/Z+)
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const a = y * segmentsX + x;
        const b = y * segmentsX + x + 1;
        const c = (y + 1) * segmentsX + x;
        const d = (y + 1) * segmentsX + x + 1;
        
        // a(TL), b(TR), c(BL), d(BR)
        // Triangle 1: a, c, b (CCW)
        indices.push(a, c, b);
        // Triangle 2: b, c, d (CCW)
        indices.push(b, c, d);
      }
    }
    
    // Bottom surface (Points Down/Z-)
    const offset = numPoints;
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const a = offset + y * segmentsX + x;
        const b = offset + y * segmentsX + x + 1;
        const c = offset + (y + 1) * segmentsX + x;
        const d = offset + (y + 1) * segmentsX + x + 1;
        
        // Reverse of top: a, b, c and b, d, c
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
    
    // North wall (y = 0)
    for (let x = 0; x < segmentsX - 1; x++) {
      const topA = x;
      const topB = x + 1;
      const botA = offset + x;
      const botB = offset + x + 1;
      
      // topA(L), topB(R), botA(L), botB(R)
      // Triangle 1: topA, topB, botA
      indices.push(topA, topB, botA);
      // Triangle 2: topB, botB, botA
      indices.push(topB, botB, botA);
    }
    
    // South wall (y = segmentsY - 1)
    for (let x = 0; x < segmentsX - 1; x++) {
      const rowStart = (segmentsY - 1) * segmentsX;
      const topA = rowStart + x;
      const topB = rowStart + x + 1;
      const botA = offset + rowStart + x;
      const botB = offset + rowStart + x + 1;
      
      // topA(L), topB(R), botA(L), botB(R)
      // Triangle 1: topA, botA, topB
      indices.push(topA, botA, topB);
      // Triangle 2: topB, botA, botB
      indices.push(topB, botA, botB);
    }
    
    // West wall (x = 0)
    for (let y = 0; y < segmentsY - 1; y++) {
      const topA = y * segmentsX;
      const topB = (y + 1) * segmentsX;
      const botA = offset + y * segmentsX;
      const botB = offset + (y + 1) * segmentsX;
      
      // topA(Top), topB(Bot), botA(Top), botB(Bot)
      // Triangle 1: topA, botA, topB
      indices.push(topA, botA, topB);
      // Triangle 2: topB, botA, botB
      indices.push(topB, botA, botB);
    }
    
    // East wall (x = segmentsX - 1)
    for (let y = 0; y < segmentsY - 1; y++) {
      const colOffset = segmentsX - 1;
      const topA = y * segmentsX + colOffset;
      const topB = (y + 1) * segmentsX + colOffset;
      const botA = offset + y * segmentsX + colOffset;
      const botB = offset + (y + 1) * segmentsX + colOffset;
      
      // topA(Top), topB(Bot), botA(Top), botB(Bot)
      // Triangle 1: topA, topB, botA
      indices.push(topA, topB, botA);
      // Triangle 2: topB, botB, botA
      indices.push(topB, botB, botA);
    }
    
    solidGeo.setIndex(indices);
    solidGeo.computeVertexNormals();
    
    const mesh = new THREE.Mesh(solidGeo, new THREE.MeshStandardMaterial());
    
    console.log("Mesh created. Vertices:", solidVertices.length / 3, "Triangles:", indices.length / 3);

    // Export
    const exporter = new STLExporter();
    // The official exporter returns DataView for binary
    const result = exporter.parse(mesh, { binary: true });
    
    console.log("STL Export Result type:", typeof result);
    if (result instanceof DataView) {
        console.log("STL Size:", result.byteLength);
        return new Blob([result], { type: 'application/octet-stream' });
    } else if (typeof result === 'string') {
        console.log("STL Size (String):", result.length);
        return new Blob([result], { type: 'text/plain' });
    } else {
        console.error("Unexpected export result:", result);
        throw new Error("Failed to export STL");
    }
  }

  private loadTile(x: number, y: number, z: number, offsetX: number, offsetY: number, ctx: CanvasRenderingContext2D): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      
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
