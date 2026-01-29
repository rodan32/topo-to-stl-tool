import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Download, Map as MapIcon, Settings, Box, RefreshCw, Eye, Circle, Layers, PenTool } from "lucide-react";
import PlanetSelector, { Planet } from "./PlanetSelector";
import LandmarkSearch from "./LandmarkSearch";

interface ControlsProps {
  onExport: () => void;
  onPreview: () => void;
  isProcessing: boolean;
  selectionBounds: { north: number; south: number; east: number; west: number } | null;
  hasPreview: boolean;
  
  // State props
  exaggeration: number[];
  setExaggeration: (val: number[]) => void;
  baseHeight: number[];
  setBaseHeight: (val: number[]) => void;
  modelWidth: number[];
  setModelWidth: (val: number[]) => void;
  resolution: "low" | "medium" | "high" | "ultra";
  setResolution: (val: "low" | "medium" | "high" | "ultra") => void;
  shape: "rectangle" | "oval";
  setShape: (val: "rectangle" | "oval") => void;
  planet: Planet;
  setPlanet: (val: Planet) => void;
  lithophane: boolean;
  setLithophane: (val: boolean) => void;
  invert: boolean;
  setInvert: (val: boolean) => void;
  onLandmarkSelect: (lat: number, lng: number, zoom: number) => void;
  onStartDrawing: () => void; // New prop for triggering draw
}

export default function Controls({ 
  onExport, 
  onPreview,
  isProcessing, 
  selectionBounds,
  hasPreview,
  exaggeration,
  setExaggeration,
  baseHeight,
  setBaseHeight,
  modelWidth,
  setModelWidth,
  resolution,
  setResolution,
  shape,
  setShape,
  planet,
  setPlanet,
  lithophane,
  setLithophane,
  invert,
  setInvert,
  onLandmarkSelect,
  onStartDrawing
}: ControlsProps) {

  return (
    <div className="absolute top-4 right-4 w-80 flex flex-col gap-4 z-[1000] pointer-events-auto max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 pb-4">
      {/* Coordinates Panel */}
      <Card className="glass-panel rounded-none border-l-4 border-l-primary">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-primary" />
            Selection Data
          </CardTitle>
          <PlanetSelector value={planet} onChange={setPlanet} />
        </CardHeader>
        <CardContent className="py-3 px-4 text-xs font-mono space-y-2">
          {selectionBounds ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">NORTH:</span>
                <span className="text-foreground">{selectionBounds.north.toFixed(4)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SOUTH:</span>
                <span className="text-foreground">{selectionBounds.south.toFixed(4)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">EAST:</span>
                <span className="text-foreground">{selectionBounds.east.toFixed(4)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">WEST:</span>
                <span className="text-foreground">{selectionBounds.west.toFixed(4)}°</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">AREA:</span>
                <span className="text-primary font-bold">READY</span>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="text-muted-foreground italic text-center py-1">
                No area selected.
              </div>
              <Button 
                size="sm" 
                variant="secondary" 
                className="w-full font-mono text-xs uppercase tracking-wider"
                onClick={onStartDrawing}
              >
                <PenTool className="w-3 h-3 mr-2" />
                Draw Selection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Panel */}
      <LandmarkSearch onSelect={onLandmarkSelect} planet={planet} />

      {/* Settings Panel */}
      <Card className="glass-panel rounded-none">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Model Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4 px-4 space-y-6">
          
          {/* Lithophane Toggle */}
          <div className="flex items-center justify-between">
             <div className="flex items-center space-x-2">
               <Layers className="w-4 h-4 text-muted-foreground" />
               <Label className="text-xs font-mono uppercase">Lithophane Mode</Label>
             </div>
             <Switch checked={lithophane} onCheckedChange={setLithophane} />
          </div>

          {lithophane ? (
             <div className="flex items-center justify-between pl-6">
               <Label className="text-xs font-mono uppercase text-muted-foreground">Invert (Dark=Low)</Label>
               <Switch checked={invert} onCheckedChange={setInvert} />
             </div>
          ) : (
             <>
              {/* Exaggeration */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-mono uppercase">Z-Exaggeration</Label>
                  <span className="text-xs font-mono bg-secondary px-1 py-0.5 rounded text-primary">
                    {exaggeration[0]}x
                  </span>
                </div>
                <Slider 
                  value={exaggeration} 
                  onValueChange={setExaggeration} 
                  min={0.5} 
                  max={5} 
                  step={0.1}
                  className="py-1"
                />
              </div>

              {/* Base Height */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-mono uppercase">Base Thickness</Label>
                  <span className="text-xs font-mono bg-secondary px-1 py-0.5 rounded text-primary">
                    {baseHeight[0]}mm
                  </span>
                </div>
                <Slider 
                  value={baseHeight} 
                  onValueChange={setBaseHeight} 
                  min={1} 
                  max={20} 
                  step={1}
                  className="py-1"
                />
              </div>
             </>
          )}

          <Separator />

          {/* Model Width */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-mono uppercase">Model Width</Label>
              <span className="text-xs font-mono bg-secondary px-1 py-0.5 rounded text-primary">
                {modelWidth[0]}mm
              </span>
            </div>
            <Slider 
              value={modelWidth} 
              onValueChange={setModelWidth} 
              min={50} 
              max={300} 
              step={5}
              className="py-1"
            />
          </div>

          {/* Shape Selection */}
          <div className="space-y-3">
            <Label className="text-xs font-mono uppercase">Base Shape</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant={shape === "rectangle" ? "default" : "outline"} 
                size="sm"
                className="text-xs font-mono rounded-none h-8"
                onClick={() => setShape("rectangle")}
              >
                <Box className="w-3 h-3 mr-2" />
                RECT
              </Button>
              <Button 
                variant={shape === "oval" ? "default" : "outline"} 
                size="sm"
                className="text-xs font-mono rounded-none h-8"
                onClick={() => setShape("oval")}
              >
                <Circle className="w-3 h-3 mr-2" />
                OVAL
              </Button>
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-3">
            <Label className="text-xs font-mono uppercase">Detail Level</Label>
            <div className="flex justify-between gap-1">
             {(["low", "medium", "high", "ultra"] as const).map((res) => (
               <button
                 key={res}
                 onClick={() => setResolution(res)}
                 className={`text-[10px] font-mono uppercase tracking-wider transition-colors px-1 ${
                   resolution === res 
                     ? "text-primary font-bold underline decoration-2 underline-offset-4" 
                     : "text-muted-foreground hover:text-foreground"
                 }`}
               >
                 {res}
               </button>
             ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Panel */}
      <div className="grid grid-cols-2 gap-2">
        <Button 
          size="lg" 
          variant="outline"
          className="w-full rounded-none font-mono uppercase tracking-wider text-xs h-12 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          disabled={!selectionBounds || isProcessing}
          onClick={(e) => {
            e.preventDefault(); // Prevent any default form submission behavior
            console.log("Preview button clicked"); // Debug log
            onPreview();
          }}
        >
          {isProcessing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </>
          )}
        </Button>
        
        <Button 
          size="lg" 
          className="w-full rounded-none font-mono uppercase tracking-wider text-xs h-12 shadow-lg shadow-primary/20"
          disabled={!selectionBounds || isProcessing}
          onClick={onExport}
        >
          {isProcessing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
