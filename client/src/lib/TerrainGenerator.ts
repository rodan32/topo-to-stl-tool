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
      
      return decodeElevation(r, g, b);
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
        const z = (elev - minElev) * exaggeration * scale + baseHeight;

        // Position centered at 0,0
        const px = (x / (segmentsX - 1)) * modelWidth - (modelWidth / 2);
        // Flip Y to match 3D coords (North is +Y usually, but image 0 is top)
        // Let's keep image coordinates logic: 0 is top (North), height is bottom (South)
        // In 3D: usually Y is up (elevation). Let's use Z for elevation, X/Y for plane.
        // Image Y=0 -> North. Image Y=max -> South.
        // Let's map Image Y to 3D -Y so North is +Y relative to South.
        const py = -((y / (segmentsY - 1)) * modelHeight - (modelHeight / 2));

        vertices.push(px, py, z);
        gridMap[y * segmentsX + x] = (vertices.length / 3) - 1;
      }
    }

    const numTopVertices = vertices.length / 3;

    // Generate Bottom Surface Vertices (Same X,Y, but Z=0)
    // We just duplicate the top vertices logic but set Z=0
    for (let i = 0; i < numTopVertices; i++) {
        vertices.push(vertices[i*3], vertices[i*3+1], 0);
    }

    // 3. Generate Triangles
    // Helper to add quad (two triangles)
    const addQuad = (v1: number, v2: number, v3: number, v4: number) => {
        // v1--v2
        // |  / |
        // | /  |
        // v4--v3
        // CCW winding
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

        // Only create quad if all 4 vertices exist (inside oval)
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
             // Bottom is reversed: v1, v2, v3, v4 -> v1, v2, v4, v3 (swap last two for quad func? no just pass in reverse order)
             // Expected: v1, v4, v3, v2 (CW from top view = CCW from bottom view)
             // Let's just use manual indices
             // Quad: 1-2-3-4
             // Tri 1: 1, 2, 4 (CW) -> Bottom View CCW
             // Tri 2: 2, 3, 4 (CW) -> Bottom View CCW
             indices.push(offset + idx1, offset + idx2, offset + idx4);
             indices.push(offset + idx2, offset + idx3, offset + idx4);
        }
      }
    }

    // Walls
    // For Rectangle: we iterate edges.
    // For Oval: we iterate all valid pixels and check neighbors. If neighbor is invalid (-1), it's a boundary.
    
    // Directions: Right, Bottom, Left, Top
    const dx = [1, 0, -1, 0];
    const dy = [0, 1, 0, -1];

    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        const currentIdx = gridMap[y * segmentsX + x];
        if (currentIdx === -1) continue; // Skip invalid points

        // Check 4 neighbors
        for (let d = 0; d < 4; d++) {
            const nx = x + dx[d];
            const ny = y + dy[d];
            
            let isBoundary = false;
            
            // Check if neighbor is out of bounds or invalid
            if (nx < 0 || nx >= segmentsX || ny < 0 || ny >= segmentsY) {
                isBoundary = true;
            } else if (gridMap[ny * segmentsX + nx] === -1) {
                isBoundary = true;
            }

            if (isBoundary) {
                // Create wall face for this edge
                // Current Top: currentIdx
                // Current Bot: offset + currentIdx
                // Next Top: ? We need the next vertex along the perimeter.
                // Actually, standard grid approach for walls:
                // If we are at (x,y) and neighbor (nx, ny) is missing, we build a wall face facing that direction.
                
                // Let's define the two vertices of the edge on the current cell
                // 0: Right edge (TR -> BR)
                // 1: Bottom edge (BR -> BL)
                // 2: Left edge (BL -> TL)
                // 3: Top edge (TL -> TR)
                // Note: We represent the cell as a point in our vertex grid. 
                // Wait, our vertices ARE the grid points. 
                // So a "boundary" is an edge between two valid vertices that connects to an invalid region?
                // No, in vertex-based heightmaps, a "wall" is formed along the boundary line of valid vertices.
                
                // Oval Logic:
                // We need to find the "boundary loop" of vertices.
                // Simple approach: Iterate all quads. If a quad edge connects a valid vertex to another valid vertex, 
                // but is NOT shared by another valid quad (or is on the edge of the grid), it is a boundary edge.
                
                // Let's simplify.
                // We just check Right and Bottom neighbors for every vertex.
                // If both are valid, we have a line segment.
                // If that segment is a boundary, we extrude it down.
                
                // Better: 
                // Iterate all valid QUADS (cells).
                // For each edge of the quad (Top, Right, Bottom, Left), check if the adjacent quad exists.
                // If NOT, that edge is a wall.
                
                // But wait, our gridMap stores VERTEX indices.
                // A quad is formed by (x,y), (x+1,y), (x+1,y+1), (x,y+1).
                // Let's iterate all potential quads (x: 0..W-2, y: 0..H-2).
            }
        }
      }
    }

    // Wall Generation (Robust Method)
    // Iterate all potential grid squares (cells) defined by 4 vertices
    for (let y = 0; y < segmentsY - 1; y++) {
      for (let x = 0; x < segmentsX - 1; x++) {
        // Indices of the 4 corners of this cell
        const tl = gridMap[y * segmentsX + x];
        const tr = gridMap[y * segmentsX + x + 1];
        const br = gridMap[(y + 1) * segmentsX + x + 1];
        const bl = gridMap[(y + 1) * segmentsX + x];

        // Check if this cell is valid (all 4 corners exist)
        const isCellValid = (tl !== -1 && tr !== -1 && br !== -1 && bl !== -1);

        if (isCellValid) {
            // Check 4 neighbors to see if they are invalid (or out of bounds)
            // If neighbor is invalid, build a wall on the shared edge

            // 1. Top Neighbor (y-1)
            let topValid = false;
            if (y > 0) {
                const n_bl = gridMap[(y - 1 + 1) * segmentsX + x]; // same as tl
                const n_br = gridMap[(y - 1 + 1) * segmentsX + x + 1]; // same as tr
                const n_tl = gridMap[(y - 1) * segmentsX + x];
                const n_tr = gridMap[(y - 1) * segmentsX + x + 1];
                if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1) topValid = true;
            }
            if (!topValid) {
                // Wall on Top Edge (TL -> TR)
                // Face outwards (North)
                // Top: TL -> TR
                // Bot: B_TL -> B_TR
                // Quad: TL, TR, B_TR, B_TL (CCW)
                indices.push(tl, tr, offset + tr);
                indices.push(tr, offset + tr, offset + tl); // wait, tl->tr->b_tr is tri 1. tr->b_tr->b_tl is tri 2.
                // Correct:
                indices.push(tl, offset + tr, offset + tl); // 1-4-3
                indices.push(tl, tr, offset + tr); // 1-2-4
            }

            // 2. Bottom Neighbor (y+1)
            let botValid = false;
            if (y < segmentsY - 2) {
                const n_tl = gridMap[(y + 1) * segmentsX + x]; // same as bl
                const n_tr = gridMap[(y + 1) * segmentsX + x + 1]; // same as br
                const n_bl = gridMap[(y + 2) * segmentsX + x];
                const n_br = gridMap[(y + 2) * segmentsX + x + 1];
                if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1) botValid = true;
            }
            if (!botValid) {
                // Wall on Bottom Edge (BR -> BL)
                // Face outwards (South)
                indices.push(br, bl, offset + bl);
                indices.push(br, offset + bl, offset + br);
            }

            // 3. Left Neighbor (x-1)
            let leftValid = false;
            if (x > 0) {
                const n_tr = gridMap[y * segmentsX + x - 1 + 1]; // same as tl
                const n_br = gridMap[(y + 1) * segmentsX + x - 1 + 1]; // same as bl
                const n_tl = gridMap[y * segmentsX + x - 1];
                const n_bl = gridMap[(y + 1) * segmentsX + x - 1];
                if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1) leftValid = true;
            }
            if (!leftValid) {
                // Wall on Left Edge (BL -> TL)
                // Face outwards (West)
                indices.push(bl, tl, offset + tl);
                indices.push(bl, offset + tl, offset + bl);
            }

            // 4. Right Neighbor (x+1)
            let rightValid = false;
            if (x < segmentsX - 2) {
                const n_tl = gridMap[y * segmentsX + x + 1]; // same as tr
                const n_bl = gridMap[(y + 1) * segmentsX + x + 1]; // same as br
                const n_tr = gridMap[y * segmentsX + x + 2];
                const n_br = gridMap[(y + 1) * segmentsX + x + 2];
                if (n_tl !== -1 && n_tr !== -1 && n_bl !== -1 && n_br !== -1) rightValid = true;
            }
            if (!rightValid) {
                // Wall on Right Edge (TR -> BR)
                // Face outwards (East)
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
