import { useState } from "react";
import Layout from "@/components/Layout";
import Map from "@/components/Map";
import Controls from "@/components/Controls";
import ModelPreview from "@/components/ModelPreview";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TerrainGenerator } from "@/lib/TerrainGenerator";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export default function Home() {
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // Controls state
  const [exaggeration, setExaggeration] = useState([1.25]);
  const [baseHeight, setBaseHeight] = useState([5]);
  const [modelWidth, setModelWidth] = useState([100]); // Default 100mm
  const [resolution, setResolution] = useState<"low" | "medium" | "high" | "ultra">("medium");
  const [shape, setShape] = useState<"rectangle" | "oval">("rectangle");
  const [planet, setPlanet] = useState<"earth" | "mars" | "moon">("earth");

  const handleSelectionChange = (bounds: Bounds) => {
    setSelectionBounds(bounds);
    // Invalidate preview when selection changes
    if (showPreview) {
      setShowPreview(false);
      setPreviewBlob(null);
    }
  };

  const generateModel = async () => {
    if (!selectionBounds) return null;
    
    setIsProcessing(true);
    const toastId = toast.loading("Generating 3D Model...", {
      description: "Fetching elevation data and building mesh."
    });
    
    try {
      await new Promise(resolve => setTimeout(resolve, 100));

    const generator = new TerrainGenerator({
      bounds: selectionBounds,
      exaggeration: exaggeration[0],
      baseHeight: baseHeight[0],
      modelWidth: modelWidth[0],
      resolution,
      shape,
      planet
    });

      const blob = await generator.generate();
      toast.dismiss(toastId);
      return blob;
    } catch (error) {
      console.error("Generation failed:", error);
      toast.error("Generation Failed", {
        id: toastId,
        description: "An error occurred while generating the model.",
      });
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreview = async () => {
    const blob = await generateModel();
    if (blob) {
      setPreviewBlob(blob);
      setShowPreview(true);
    }
  };

  const handleExport = async () => {
    // If we already have a preview, download it directly
    let blob = previewBlob;
    
    // Otherwise generate it
    if (!blob) {
      blob = await generateModel();
    }
    
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `topo_model_${Date.now()}.stl`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("Download Started", {
        description: "Your STL file is ready for printing.",
      });
    }
  };

  return (
    <Layout>
      <div className="relative w-full h-full">
        {/* Map Layer */}
        <Map 
          onSelectionChange={handleSelectionChange} 
          className="w-full h-full z-0"
          planet={planet}
        />
        
        {/* Preview Layer Overlay */}
        {showPreview && (
          <div className="absolute inset-0 z-30 bg-background/95 animate-in fade-in duration-300">
            <ModelPreview stlBlob={previewBlob} />
            
            <div className="absolute top-24 left-6 pointer-events-auto">
               <Button 
                variant="outline" 
                size="icon"
                onClick={() => setShowPreview(false)}
                className="rounded-full bg-background border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="absolute top-24 left-20 bg-card/80 backdrop-blur px-4 py-2 border border-border text-xs font-mono">
              PREVIEW MODE: {modelWidth[0]}mm WIDTH
            </div>
          </div>
        )}
        
        <Controls 
          onExport={handleExport}
          onPreview={handlePreview}
          isProcessing={isProcessing} 
          selectionBounds={selectionBounds}
          hasPreview={!!previewBlob && showPreview}
          
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
      />
      </div>
    </Layout>
  );
}
