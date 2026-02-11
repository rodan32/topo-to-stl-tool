import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Map as MapIcon, Home, Heart, Code } from "lucide-react";
import { Link } from "wouter";

export default function Thanks() {
  return (
    <div className="min-h-screen w-full bg-background p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
            <Heart className="w-6 h-6 text-primary" />
            Thanks &amp; data sources
          </h1>
          <Link href="/">
            <Button
              variant="outline"
              size="sm"
              className="rounded-none font-mono uppercase tracking-wider text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to map
            </Button>
          </Link>
        </div>

        <Card className="glass-panel rounded-none border-l-4 border-l-primary">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-primary" />
              Map display (what you see)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4 text-sm font-mono space-y-3">
            <p className="text-muted-foreground uppercase tracking-wider text-xs">
              Earth
            </p>
            <p>
              <a
                href="https://opentopomap.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                OpenTopoMap
              </a>{" "}
              — OSM + SRTM–derived styling.{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                © OpenStreetMap
              </a>{" "}
              contributors.
            </p>
            <Separator className="my-2" />
            <p className="text-muted-foreground uppercase tracking-wider text-xs">
              Mars
            </p>
            <p>
              <a
                href="https://www.arcgis.com/home/item.html?id=0ab1bc2beb3544709b6f8c746c4e4112"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                ESRI OnMars MOLA Color
              </a>{" "}
              — NASA MOLA elevation–derived basemap.
            </p>
            <Separator className="my-2" />
            <p className="text-muted-foreground uppercase tracking-wider text-xs">
              Moon
            </p>
            <p>
              <a
                href="https://www.arcgis.com/home/item.html?id=6f4e1d391c404a0d9b608e2c0d3a0c7e"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                ESRI OnMoon LRO LOLA
              </a>{" "}
              — NASA LRO/LOLA elevation–derived basemap.
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel rounded-none border-l-4 border-l-primary">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-primary" />
              Elevation / topo (for STL generation)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4 text-sm font-mono space-y-3">
            <p className="text-muted-foreground uppercase tracking-wider text-xs">
              Earth
            </p>
            <p>
              <a
                href="https://github.com/tilezen/joerd/blob/master/docs/data-sources.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                AWS Terrarium
              </a>{" "}
              — RGB-encoded elevation tiles (SRTM and other DEMs). Used for all
              Earth STL generation so height values are real meters, not inferred
              from a display image.
            </p>
            <Separator className="my-2" />
            <p className="text-muted-foreground uppercase tracking-wider text-xs">
              Mars &amp; Moon
            </p>
            <p>
              CARTO planetary basemaps (MOLA / LOLA–derived).{" "}
              <a
                href="https://github.com/CARTOspace/carto-spatial-datasources"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                CARTO
              </a>
              .
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel rounded-none border-l-4 border-l-primary">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
              <Code className="w-4 h-4 text-primary" />
              Built with
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4 text-sm font-mono space-y-2">
            <p>
              <a
                href="https://cursor.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Cursor
              </a>{" "}
              — for helping bring this tool together.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
