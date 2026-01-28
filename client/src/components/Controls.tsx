import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, Map as MapIcon, Settings, Box, RefreshCw } from "lucide-react";

interface ControlsProps {
  onExport: () => void;
  isExporting: boolean;
  selectionBounds: { north: number; south: number; east: number; west: number } | null;
  
  // State props
  exaggeration: number[];
  setExaggeration: (val: number[]) => void;
  baseHeight: number[];
  setBaseHeight: (val: number[]) => void;
  resolution: "low" | "medium" | "high" | "ultra";
  setResolution: (val: "low" | "medium" | "high" | "ultra") => void;
  shape: "rectangle" | "oval";
  setShape: (val: "rectangle" | "oval") => void;
}

export default function Controls({ 
  onExport, 
  isExporting, 
  selectionBounds,
  exaggeration,
  setExaggeration,
  baseHeight,
  setBaseHeight,
  resolution,
  setResolution,
  shape,
  setShape
}: ControlsProps) {

  return (
    <div className="absolute top-20 right-6 w-80 flex flex-col gap-4 z-40 pointer-events-auto max-h-[calc(100vh-8rem)] overflow-y-auto pr-1 pb-4">
      {/* Coordinates Panel */}
      <Card className="glass-panel rounded-none border-l-4 border-l-primary">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-primary" />
            Selection Data
          </CardTitle>
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
            <div className="text-muted-foreground italic text-center py-2">
              No area selected. Draw a rectangle on the map.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Panel */}
      <Card className="glass-panel rounded-none">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Model Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4 px-4 space-y-6">
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
                disabled={true} // Disabled for V1
                title="Coming soon"
              >
                <RefreshCw className="w-3 h-3 mr-2" />
                OVAL
              </Button>
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-3">
            <Label className="text-xs font-mono uppercase">Detail Level</Label>
            <Select 
              value={resolution} 
              onValueChange={(val: "low" | "medium" | "high" | "ultra") => setResolution(val)}
            >
              <SelectTrigger className="h-8 text-xs font-mono rounded-none">
                <SelectValue placeholder="Select resolution" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">LOW (Fast)</SelectItem>
                <SelectItem value="medium">MEDIUM (Balanced)</SelectItem>
                <SelectItem value="high">HIGH (Detailed)</SelectItem>
                <SelectItem value="ultra">ULTRA (Slow)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Action Panel */}
      <Button 
        size="lg" 
        className="w-full rounded-none font-mono uppercase tracking-wider text-sm h-12 shadow-lg shadow-primary/20"
        disabled={!selectionBounds || isExporting}
        onClick={onExport}
      >
        {isExporting ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-2" />
            Generate STL
          </>
        )}
      </Button>
    </div>
  );
}
