import { useState, useRef, useEffect } from "react";
import Map from "@/components/Map";
import Controls from "@/components/Controls";
import { TerrainGenerator } from "@/lib/TerrainGenerator";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";
import { Planet } from "@/components/PlanetSelector";
import { toast } from "sonner";
import { X } from "lucide-react";

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
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Map Reference to control view
  const mapRef = useRef<any>(null);

  const handleLandmarkSelect = (lat: number, lng: number, zoom: number) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], zoom);
    }
  };

  const generateModel = async (forPreview: boolean) => {
    if (!selectionBounds) return;

    setIsProcessing(true);
    try {
      const generator = new TerrainGenerator({
        bounds: selectionBounds,
        exaggeration: exaggeration[0],
        baseHeight: baseHeight[0],
        modelWidth: modelWidth[0],
        resolution: resolution,
        shape: shape,
        planet: planet,
        lithophane: lithophane,
        invert: invert
      });

      const blob = await generator.generate();

      if (forPreview) {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        // Cleanup old URL if exists
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
    } catch (error) {
      console.error("Generation failed:", error);
      toast.error("Failed to generate model. Try a smaller area or lower resolution.");
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
    loader.load(previewUrl, (geometry) => {
      geometry.computeVertexNormals();
      
      // Center geometry
      geometry.center();
      
      // Material
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x00aaff, 
        metalness: 0.2, 
        roughness: 0.6,
        flatShading: false
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2; // Rotate to sit flat on grid
      
      scene.add(mesh);
      meshRef.current = mesh;

      // Fit camera to object
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      camera.position.set(maxDim, maxDim * 1.5, maxDim * 1.5);
      camera.lookAt(0, 0, 0);
    });

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
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, [previewUrl]);

  return (
    <div className="w-full h-screen relative overflow-hidden bg-background">
      <Map 
        onBoundsChange={setSelectionBounds} 
        planet={planet} 
        onMapReady={(map) => { mapRef.current = map; }}
      />
      
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
        onLandmarkSelect={handleLandmarkSelect}
      />

      {/* Preview Overlay */}
      {previewUrl && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-[80vw] h-[80vh] bg-background border border-border shadow-2xl rounded-lg overflow-hidden">
            <button 
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors"
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
