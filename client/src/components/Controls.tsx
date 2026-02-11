import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Download, Map as MapIcon, Settings, Box, RefreshCw, Eye, Circle, Layers, PenTool, Type, Move } from "lucide-react";
import { Link } from "wouter";
import PlanetSelector, { Planet } from "./PlanetSelector";
import { Input } from "@/components/ui/input";
import { useState } from "react";

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
  onStartDrawing: () => void;
  onResizeSelection: () => void;
  lastElevationSource: "usgs3dep" | "terrarium" | "mars" | "moon" | "venus" | null;
  onSetBoundsFromManual: (bounds: { north: number; south: number; east: number; west: number }) => void;
  onClearSelection: () => void;
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
  onStartDrawing,
  onResizeSelection,
  lastElevationSource,
  onSetBoundsFromManual,
  onClearSelection,
}: ControlsProps) {
  const [manualNorth, setManualNorth] = useState("");
  const [manualSouth, setManualSouth] = useState("");
  const [manualEast, setManualEast] = useState("");
  const [manualWest, setManualWest] = useState("");

  const handleUseManualBounds = () => {
    const n = parseFloat(manualNorth);
    const s = parseFloat(manualSouth);
    const e = parseFloat(manualEast);
    const w = parseFloat(manualWest);
    if (
      Number.isFinite(n) &&
      Number.isFinite(s) &&
      Number.isFinite(e) &&
      Number.isFinite(w) &&
      n > s &&
      e > w &&
      n >= -90 &&
      n <= 90 &&
      s >= -90 &&
      s <= 90 &&
      e >= -180 &&
      e <= 180 &&
      w >= -180 &&
      w <= 180
    ) {
      onSetBoundsFromManual({ north: n, south: s, east: e, west: w });
    }
  };

  const canUseManual =
    manualNorth !== "" &&
    manualSouth !== "" &&
    manualEast !== "" &&
    manualWest !== "";

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
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 font-mono text-xs uppercase tracking-wider"
                  onClick={onResizeSelection}
                >
                  <Move className="w-3 h-3 mr-2" />
                  Resize
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                  onClick={onClearSelection}
                >
                  Clear
                </Button>
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
              <Separator className="my-2" />
              <div className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider flex items-center gap-1">
                <Type className="w-3 h-3" />
                Or enter bounds
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] font-mono">N</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="40.5"
                    value={manualNorth}
                    onChange={(e) => setManualNorth(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-mono">S</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="40.3"
                    value={manualSouth}
                    onChange={(e) => setManualSouth(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-mono">E</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="-111.5"
                    value={manualEast}
                    onChange={(e) => setManualEast(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-mono">W</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="-111.7"
                    value={manualWest}
                    onChange={(e) => setManualWest(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full font-mono text-xs uppercase tracking-wider"
                onClick={handleUseManualBounds}
                disabled={!canUseManual}
              >
                Use these bounds
              </Button>
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
      <Card className="glass-panel rounded-none">
        <CardContent className="py-4 px-4">
          <div className="grid grid-cols-2 gap-2">
            <Button 
              size="lg" 
              variant="outline"
              className="w-full rounded-none font-mono uppercase tracking-wider text-xs h-12 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              disabled={!selectionBounds || isProcessing}
              onClick={(e) => {
                e.preventDefault();
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
        </CardContent>
      </Card>

      {/* Elevation data source & Thanks */}
      <Card className="glass-panel rounded-none">
        <CardContent className="py-3 px-4 space-y-3 relative z-10">
          {lastElevationSource && (
            <div className="text-[10px] font-mono text-slate-800 dark:text-slate-200">
              <span className="uppercase tracking-wider">Elevation data: </span>
              {lastElevationSource === "usgs3dep" && (
                <a
                  href="https://apps.nationalmap.gov/3dep/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  USGS 3DEP
                </a>
              )}
              {lastElevationSource === "terrarium" && (
                <a
                  href="https://github.com/tilezen/joerd/blob/master/docs/data-sources.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  AWS Terrarium
                </a>
              )}
              {lastElevationSource === "mars" && (
                <>
                  <a
                    href="https://astrogeology.usgs.gov/search/map/Mars/MarsOdyssey/MOLA/Mars_MGS_MOLA_DEM_mosaic_0.463deg"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    NASA MOLA
                  </a>
                  {" / CARTO"}
                </>
              )}
              {lastElevationSource === "moon" && (
                <>
                  <a
                    href="https://astrogeology.usgs.gov/search/map/Moon/LRO/LOLA/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    NASA LRO LOLA
                  </a>
                  {" / CARTO"}
                </>
              )}
              {lastElevationSource === "venus" && (
                <a
                  href="https://planetarymaps.usgs.gov/mosaic/Venus_Magellan_Topography_Global_4641m_v02"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  NASA Magellan Global Topography
                </a>
              )}
            </div>
          )}
          <div className="text-[10px] font-mono text-slate-800 dark:text-slate-200">
            <Link href="/thanks" className="text-primary hover:underline uppercase tracking-wider">
              Thanks &amp; data sources
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
