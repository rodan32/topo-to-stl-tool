import { useState } from "react";
import Layout from "@/components/Layout";
import MapSelection from "@/components/MapSelection";
import Controls from "@/components/Controls";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TerrainGenerator } from "@/lib/TerrainGenerator";

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export default function Home() {
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // State lifted from Controls to pass to generator
  const [exaggeration, setExaggeration] = useState([1.5]);
  const [baseHeight, setBaseHeight] = useState([5]);
  const [resolution, setResolution] = useState<"low" | "medium" | "high" | "ultra">("medium");
  const [shape, setShape] = useState<"rectangle" | "oval">("rectangle");

  const handleSelectionChange = (bounds: Bounds) => {
    setSelectionBounds(bounds);
  };

  const handleExport = async () => {
    if (!selectionBounds) return;
    
    setIsExporting(true);
    const toastId = toast.loading("Generating STL...", {
      description: "Fetching elevation data and building 3D model."
    });
    
    try {
      // Small delay to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 100));

      const generator = new TerrainGenerator({
        bounds: selectionBounds,
        exaggeration: exaggeration[0],
        baseHeight: baseHeight[0],
        resolution: resolution,
        shape: shape
      });

      const blob = await generator.generate();
      
      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `topo_model_${Date.now()}.stl`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Export Complete", {
        id: toastId,
        description: "Your STL file is ready for printing.",
        duration: 3000,
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Export Failed", {
        id: toastId,
        description: "An error occurred while generating the model.",
        duration: 5000,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Layout>
      <div className="relative w-full h-full">
        <MapSelection 
          onSelectionChange={handleSelectionChange} 
          className="z-0"
        />
        
        <Controls 
          onExport={handleExport} 
          isExporting={isExporting} 
          selectionBounds={selectionBounds}
          // Pass state setters to Controls
          exaggeration={exaggeration}
          setExaggeration={setExaggeration}
          baseHeight={baseHeight}
          setBaseHeight={setBaseHeight}
          resolution={resolution}
          setResolution={setResolution}
          shape={shape}
          setShape={setShape}
        />
      </div>
    </Layout>
  );
}
