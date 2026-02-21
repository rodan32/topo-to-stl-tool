import { useState, useRef, useEffect } from "react";
import Map, { MapRef } from "@/components/Map";
import Controls from "@/components/Controls";
import LandmarkSearch from "@/components/LandmarkSearch";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";
import { Planet } from "@/components/PlanetSelector";
import { toast } from "sonner";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc";

/** Per-planet defaults; applied when switching bodies so Earth/Mars/Moon each get correct settings. */
const PLANET_DEFAULTS: Record<
  Planet,
  {
    exaggeration: number[];
    baseHeight: number[];
    modelWidth: number[];
    resolution: "low" | "medium" | "high" | "ultra";
    shape: "rectangle" | "oval";
    mapCenter: { lat: number; lng: number };
    mapZoom: number;
  }
> = {
  earth: {
    exaggeration: [1.25],
    baseHeight: [2],
    modelWidth: [100],
    resolution: "medium",
    shape: "rectangle",
    mapCenter: { lat: 39, lng: -98 }, // Continental US
    mapZoom: 4,
  },
  mars: {
    exaggeration: [1.25],
    baseHeight: [2],
    modelWidth: [100],
    resolution: "medium",
    shape: "rectangle",
    mapCenter: { lat: 18.65, lng: 226.2 }, // Olympus Mons
    mapZoom: 6,
  },
  moon: {
    exaggeration: [1.25],
    baseHeight: [2],
    modelWidth: [100],
    resolution: "medium",
    shape: "rectangle",
    mapCenter: { lat: 0.67, lng: 23.47 }, // Apollo 11
    mapZoom: 7,
  },
  venus: {
    exaggeration: [1.25],
    baseHeight: [2],
    modelWidth: [100],
    resolution: "medium",
    shape: "rectangle",
    mapCenter: { lat: 65.2, lng: 3.3 }, // Maxwell Montes
    mapZoom: 5,
  },
};

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export default function Home() {
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Settings State
  const [exaggeration, setExaggeration] = useState([1.25]);
  const [baseHeight, setBaseHeight] = useState([2]);
  const [modelWidth, setModelWidth] = useState([100]);
  const [resolution, setResolution] = useState<"low" | "medium" | "high" | "ultra">("medium");
  const [shape, setShape] = useState<"rectangle" | "oval">("rectangle");
  const [planet, setPlanet] = useState<Planet>("earth");
  const [lithophane, setLithophane] = useState(false);
  const [invert, setInvert] = useState(false);

  // Preview State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** Last elevation data source used (for attribution). */
  const [lastElevationSource, setLastElevationSource] = useState<
    "usgs3dep" | "terrarium" | "open-elevation" | "mars" | "moon" | "venus" | null
  >(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Map Reference to control view
  const mapRef = useRef<MapRef>(null);

  // When switching bodies, revert to correct settings for the selected planet.
  const prevPlanetRef = useRef<Planet | null>(null);
  useEffect(() => {
    const prev = prevPlanetRef.current;
    prevPlanetRef.current = planet;
    if (prev !== null && prev !== planet) {
      const d = PLANET_DEFAULTS[planet];
      setExaggeration(d.exaggeration);
      setBaseHeight(d.baseHeight);
      setModelWidth(d.modelWidth);
      setResolution(d.resolution);
      setShape(d.shape);
      setSelectionBounds(null);
      setPreviewUrl(null);
      setLastElevationSource(null);
      if (mapRef.current) {
        mapRef.current.flyTo(d.mapCenter.lat, d.mapCenter.lng, d.mapZoom);
      }
    }
  }, [planet]);

  const handleLandmarkSelect = (lat: number, lng: number, zoom: number) => {
    if (mapRef.current) {
      mapRef.current.flyTo(lat, lng, zoom);
    }
  };
  
  const handleStartDrawing = () => {
    if (mapRef.current) {
      mapRef.current.startDrawing();
      toast.info("Click and drag on the map to draw a selection.", {
        duration: 5000,
      });
    }
  };

  const handleResizeSelection = () => {
    if (mapRef.current) {
      mapRef.current.startEditing();
      toast.info("Click the selection, then drag corners or edges to resize.", {
        duration: 5000,
      });
    }
  };

  const terrainMutation = trpc.terrain.generate.useMutation();

  const generateModel = async (forPreview: boolean) => {
    if (!selectionBounds) {
      if (forPreview) toast.error("Draw a region on the map first, then click Preview.");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await terrainMutation.mutateAsync({
        bounds: selectionBounds,
        exaggeration: exaggeration[0],
        baseHeight: baseHeight[0],
        modelWidth: modelWidth[0],
        resolution: resolution,
        shape: shape,
        planet: planet,
        lithophane: lithophane,
        invert: invert,
      });

      // Decode base64 STL to Blob
      const binaryString = atob(result.stl);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/octet-stream" });

      if (result.elevationSource) {
        setLastElevationSource(result.elevationSource);
      }

      if (forPreview) {
        console.log("Home: Preview Blob generated, size:", blob.size);
        const url = URL.createObjectURL(blob);
        console.log("Home: Setting Preview URL:", url);
        setPreviewUrl(url);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `topo_model_${planet}_${Date.now()}.stl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Download started!");
      }
    } catch (error: unknown) {
      console.error("Generation failed:", error);
      const isTimeout =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message?: string }).message === "string" &&
        ((error as { message: string }).message.includes("Unexpected token '<'") ||
          (error as { message: string }).message.includes("504") ||
          (error as { message: string }).message.includes("Gateway Timeout"));
      toast.error(
        isTimeout
          ? "Request timed out. We're working on faster generation for large areas."
          : "Couldn't generate a model for this area."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Initialize Three.js Scene
  useEffect(() => {
    if (!previewUrl || !previewContainerRef.current) return;

    // Cleanup previous scene
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (previewContainerRef.current.contains(rendererRef.current.domElement)) {
        previewContainerRef.current.removeChild(rendererRef.current.domElement);
      }
    }

    const width = previewContainerRef.current.clientWidth;
    const height = previewContainerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    
    // Add grid helper
    const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 100, 150);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    previewContainerRef.current.appendChild(renderer.domElement);

    // Load STL
    const loader = new STLLoader();
    loader.load(
      previewUrl,
      (geometry) => {
        if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
          console.error("STL preview: empty geometry");
          setPreviewUrl(null);
          return;
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: 0x00aaff,
          metalness: 0.2,
          roughness: 0.6,
          flatShading: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2; // STL Z-up → Three.js Y-up (base was z=0, now y=0)

        scene.add(mesh);
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        // Move mesh so its base (min Y after rotation) sits on the grid at y=0
        mesh.position.y = -box.min.y;
        meshRef.current = mesh;

        mesh.updateMatrixWorld(true);
        box.setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 100;

        camera.position.set(maxDim, maxDim, maxDim);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
      },
      undefined,
      (error) => {
        console.error("STL preview load failed:", error);
        setPreviewUrl(null);
      }
    );

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Animation Loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      if (meshRef.current) {
        meshRef.current.rotation.z += 0.005; // Rotate slowly
      }
      
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      
      // Full cleanup to prevent memory leaks
      if (sceneRef.current) {
          sceneRef.current.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                  if (object.geometry) object.geometry.dispose();
                  if (object.material) {
                      if (Array.isArray(object.material)) {
                          object.material.forEach(m => m.dispose());
                      } else {
                          object.material.dispose();
                      }
                  }
              }
          });
      }
      
      if (rendererRef.current) {
          rendererRef.current.dispose();
          rendererRef.current.forceContextLoss();
      }
    };
  }, [previewUrl]);

  return (
    <div className="w-full h-screen relative overflow-hidden bg-background">
      {/* Map fills viewport so it always has size for draw events */}
      <div className="absolute inset-0 z-0">
        <Map
          ref={mapRef}
          onBoundsChange={setSelectionBounds}
          planet={planet}
          selectionBounds={selectionBounds}
          shape={shape}
        />
      </div>

      {/* Search - upper left, just right of zoom controls */}
      <div className="absolute top-4 left-14 z-[1000] pointer-events-auto">
        <LandmarkSearch onSelect={handleLandmarkSelect} planet={planet} />
      </div>

      <Controls
        onExport={() => generateModel(false)}
        onPreview={() => generateModel(true)}
        isProcessing={isProcessing}
        selectionBounds={selectionBounds}
        hasPreview={!!previewUrl}
        exaggeration={exaggeration}
        setExaggeration={setExaggeration}
        baseHeight={baseHeight}
        setBaseHeight={setBaseHeight}
        modelWidth={modelWidth}
        setModelWidth={setModelWidth}
        resolution={resolution}
        setResolution={setResolution}
        shape={shape}
        setShape={setShape}
        planet={planet}
        setPlanet={setPlanet}
        lithophane={lithophane}
        setLithophane={setLithophane}
        invert={invert}
        setInvert={setInvert}
        onStartDrawing={handleStartDrawing}
        onResizeSelection={handleResizeSelection}
        lastElevationSource={lastElevationSource}
        onSetBoundsFromManual={setSelectionBounds}
        onClearSelection={() => setSelectionBounds(null)}
      />

      {/* Preview Overlay */}
      {previewUrl && (
        <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-[80vw] h-[80vh] bg-background border border-border shadow-2xl rounded-lg overflow-hidden">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors shadow-lg ring-2 ring-background/50"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
            <div ref={previewContainerRef} className="w-full h-full" />
            <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-none">
              <span className="bg-background/80 backdrop-blur px-3 py-1 rounded text-xs font-mono border border-border">
                Click and drag to rotate (Coming Soon) • Scroll to Zoom
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
