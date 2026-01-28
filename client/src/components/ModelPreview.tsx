import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

interface ModelPreviewProps {
  stlBlob: Blob | null;
  className?: string;
}

export default function ModelPreview({ stlBlob, className }: ModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize Scene
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a); // Dark grey background
    // Add grid
    const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    scene.add(gridHelper);
    
    // Add axes
    const axesHelper = new THREE.AxesHelper(50);
    scene.add(axesHelper);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(100, 100, 100);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffaa00, 0.3); // Warm backlight
    dirLight2.position.set(-50, 20, -50);
    scene.add(dirLight2);

    // Store refs
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    // Animation Loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Load STL
  useEffect(() => {
    if (!stlBlob || !sceneRef.current) return;

    // Remove old mesh
    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current);
      if (meshRef.current.geometry) meshRef.current.geometry.dispose();
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach(m => m.dispose());
      } else {
        meshRef.current.material.dispose();
      }
      meshRef.current = null;
    }

    const loader = new STLLoader();
    const url = URL.createObjectURL(stlBlob);

    console.log("Loading STL preview from blob:", stlBlob.size, "bytes");

    loader.load(url, (geometry) => {
      console.log("STL loaded successfully. Vertices:", geometry.attributes.position.count);
      
      if (geometry.attributes.position.count === 0) {
        console.error("STL geometry is empty!");
        return;
      }

      // Center geometry
      geometry.center();
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({ 
        color: 0xff5500, // Industrial Orange
        roughness: 0.6,
        metalness: 0.1,
        flatShading: true,
        side: THREE.DoubleSide
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      // Rotate to match grid (STL is usually Z-up, Three.js is Y-up)
      mesh.rotation.x = -Math.PI / 2;
      
      sceneRef.current?.add(mesh);
      meshRef.current = mesh;

      // Fit camera to object
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      console.log("Model dimensions:", size);

      if (controlsRef.current && cameraRef.current) {
        const distance = maxDim * 2.5;
        // Position camera nicely
        const angle = Math.PI / 4;
        cameraRef.current.position.set(
          Math.cos(angle) * distance,
          distance * 0.8,
          Math.sin(angle) * distance
        );
        cameraRef.current.lookAt(0, 0, 0);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
      
      URL.revokeObjectURL(url);
    }, undefined, (error) => {
      console.error("Error loading STL preview:", error);
    });

  }, [stlBlob]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`} />
  );
}
