import * as THREE from "three";
import { STLExporter } from "./STLExporter";

interface TerrainOptions {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  exaggeration: number;
  baseHeight: number;
  resolution: "low" | "medium" | "high" | "ultra";
  shape: "rectangle" | "oval";
}

// Mapbox Terrain-RGB tiles encoding: height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
// AWS Terrarium encoding: (r * 256 + g + b / 256) - 32768
const decodeElevation = (r: number, g: number, b: number): number => {
  // Using AWS Terrarium format since we switched to that source
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
    const { bounds, exaggeration, baseHeight, shape } = this.options;
    const zoom = this.getZoomLevel();

    // Calculate tile range
    const xMin = long2tile(bounds.west, zoom);
    const xMax = long2tile(bounds.east, zoom);
    const yMin = lat2tile(bounds.north, zoom);
    const yMax = lat2tile(bounds.south, zoom);

    // Canvas to draw tiles onto
    const canvas = document.createElement("canvas");
    const tileSize = 256;
    const width = (xMax - xMin + 1) * tileSize;
    const height = (yMax - yMin + 1) * tileSize;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) throw new Error("Could not create canvas context");

    // Fetch and draw tiles
    const tilePromises = [];
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tilePromises.push(this.loadTile(x, y, zoom, x - xMin, y - yMin, ctx));
      }
    }
    
    await Promise.all(tilePromises);

    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Create geometry
    // Downsample for performance if needed, but for now we'll use a reasonable segment count
    // Calculate aspect ratio of the selected area
    const latSpan = bounds.north - bounds.south;
    const lonSpan = bounds.east - bounds.west;
    const aspectRatio = lonSpan / latSpan; // Simplification, ideally account for projection distortion

    const segmentsX = Math.min(width, 256); // Limit vertices for browser performance
    const segmentsY = Math.round(segmentsX / aspectRatio);

    const geometry = new THREE.PlaneGeometry(100, 100 / aspectRatio, segmentsX - 1, segmentsY - 1);
    const vertices = geometry.attributes.position.array;

    // Apply elevation to vertices
    let minElev = Infinity;
    
    // First pass: find minimum elevation
    for (let i = 0; i < vertices.length; i += 3) {
      // Map vertex coordinates to image coordinates
      // PlaneGeometry is centered at 0,0. x goes -width/2 to width/2, y goes height/2 to -height/2
      // UV coordinates would be better but we can map manually
      
      // Get normalized coordinates (0 to 1)
      // Vertices are ordered row by row from top-left
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
    }

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
      
      // Apply exaggeration and base height
      const centerLat = (bounds.north + bounds.south) / 2;
      // const metersPerDegreeLat = 111132.954 - 559.822 * Math.cos(2 * centerLat * Math.PI / 180);
      const metersPerDegreeLon = 111132.954 * Math.cos(centerLat * Math.PI / 180);
      
      const realWidthMeters = lonSpan * metersPerDegreeLon;
      const scale = 100 / realWidthMeters;
      
      vertices[i + 2] = (elev - minElev) * exaggeration * scale * 1000 + baseHeight; 
    }

    geometry.computeVertexNormals();

    // Constructing a solid mesh:
    // 1. Grid of vertices for top (terrain)
    // 2. Grid of vertices for bottom (flat at z=0)
    // 3. Triangles for top
    // 4. Triangles for bottom
    // 5. Triangles for sides (North, South, East, West)
    
    // Let's do this with a custom BufferGeometry
    const solidGeo = new THREE.BufferGeometry();
    const numPoints = segmentsX * segmentsY;
    // const numIndices = (segmentsX - 1) * (segmentsY - 1) * 6;
    
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
    
    // Top surface
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const a = y * segmentsX + x;
        const b = y * segmentsX + x + 1;
        const c = (y + 1) * segmentsX + x;
        const d = (y + 1) * segmentsX + x + 1;
        
        // a, b, d
        // d, c, a
        indices.push(a, b, d);
        indices.push(d, c, a);
      }
    }
    
    // Bottom surface (winding order reversed to face down)
    const offset = numPoints;
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        const a = offset + y * segmentsX + x;
        const b = offset + y * segmentsX + x + 1;
        const c = offset + (y + 1) * segmentsX + x;
        const d = offset + (y + 1) * segmentsX + x + 1;
        
        // a, c, d
        // d, b, a
        indices.push(a, c, d);
        indices.push(d, b, a);
      }
    }
    
    // North wall (y = 0)
    for (let x = 0; x < segmentsX - 1; x++) {
      const topA = x;
      const topB = x + 1;
      const botA = offset + x;
      const botB = offset + x + 1;
      
      // topA, botA, botB
      // botB, topB, topA
      indices.push(topA, botA, botB);
      indices.push(botB, topB, topA);
    }
    
    // South wall (y = segmentsY - 1)
    for (let x = 0; x < segmentsX - 1; x++) {
      const rowStart = (segmentsY - 1) * segmentsX;
      const topA = rowStart + x;
      const topB = rowStart + x + 1;
      const botA = offset + rowStart + x;
      const botB = offset + rowStart + x + 1;
      
      // topA, topB, botB
      // botB, botA, topA
      indices.push(topA, topB, botB);
      indices.push(botB, botA, topA);
    }
    
    // West wall (x = 0)
    for (let y = 0; y < segmentsY - 1; y++) {
      const topA = y * segmentsX;
      const topB = (y + 1) * segmentsX;
      const botA = offset + y * segmentsX;
      const botB = offset + (y + 1) * segmentsX;
      
      // topA, topB, botB
      // botB, botA, topA
      indices.push(topA, topB, botB);
      indices.push(botB, botA, topA);
    }
    
    // East wall (x = segmentsX - 1)
    for (let y = 0; y < segmentsY - 1; y++) {
      const colOffset = segmentsX - 1;
      const topA = y * segmentsX + colOffset;
      const topB = (y + 1) * segmentsX + colOffset;
      const botA = offset + y * segmentsX + colOffset;
      const botB = offset + (y + 1) * segmentsX + colOffset;
      
      // topA, botA, botB
      // botB, topB, topA
      indices.push(topA, botA, botB);
      indices.push(botB, topB, topA);
    }
    
    solidGeo.setIndex(indices);
    solidGeo.computeVertexNormals();
    
    const mesh = new THREE.Mesh(solidGeo, new THREE.MeshStandardMaterial());
    
    // Oval shape handling
    if (shape === "oval") {
      // Create an oval geometry and intersect? Too complex for client-side JS quickly.
      // Instead, we can modify the vertices of the box to form an oval cylinder.
      // But the grid is rectangular.
      // We'd need to distort the grid or trim it.
      // Trimming requires re-triangulation.
      // Distortion (mapping square grid to circle) preserves topology but distorts terrain.
      // Let's stick to rectangle only for MVP V1 to ensure robustness.
      console.warn("Oval shape not fully implemented in V1, defaulting to rectangle");
    }
    
    // Export
    const exporter = new STLExporter();
    const stlString = exporter.parse(mesh, { binary: true });
    
    return new Blob([stlString], { type: 'application/octet-stream' });
  }

  private loadTile(x: number, y: number, z: number, offsetX: number, offsetY: number, ctx: CanvasRenderingContext2D): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      // Use AWS Terrain Tiles (free, no key needed)
      // Format: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
      img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      
      img.onload = () => {
        ctx.drawImage(img, offsetX * 256, offsetY * 256);
        resolve();
      };
      
      img.onerror = () => {
        console.error(`Failed to load tile ${z}/${x}/${y}`);
        // Resolve anyway to continue with partial data
        resolve();
      };
    });
  }
}
