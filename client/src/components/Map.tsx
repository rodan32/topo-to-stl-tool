import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

// Define tile layers for each planet
const TILE_LAYERS = {
  earth: {
    // Switch to OpenTopoMap for better terrain visualization
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17
  },
  mars: {
    // ESRI Mars MOLA Elevation
    url: "https://astro.arcgis.com/arcgis/rest/services/OnMars/MOLAColor/MapServer/tile/{z}/{y}/{x}",
    attribution: 'NASA/MOLA',
    maxZoom: 12
  },
  moon: {
    // ESRI Moon LOLA Elevation
    url: "https://astro.arcgis.com/arcgis/rest/services/OnMoon/LRO_LOLA_Color_Global_Mosaic/MapServer/tile/{z}/{y}/{x}",
    attribution: 'NASA/LRO/LOLA',
    maxZoom: 12
  }
};

export interface MapRef {
  startDrawing: () => void;
  flyTo: (lat: number, lng: number, zoom: number) => void;
}

interface MapProps {
  onBoundsChange: (bounds: { north: number; south: number; east: number; west: number } | null) => void;
  className?: string;
  planet: "earth" | "mars" | "moon";
  onMapReady?: (map: L.Map) => void;
}

const Map = forwardRef<MapRef, MapProps>(({ onBoundsChange, className, planet, onMapReady }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    startDrawing: () => {
      if (!mapInstanceRef.current) return;
      
      // Clear existing selection first
      if (drawnItemsRef.current) {
        drawnItemsRef.current.clearLayers();
        onBoundsChange(null);
      }

      // Programmatically start the rectangle draw handler
      const drawHandler = new L.Draw.Rectangle(mapInstanceRef.current as any, {
        shapeOptions: {
          color: '#ff4500',
          weight: 4, // Thicker line
          opacity: 1,
          fillOpacity: 0.2,
          fillColor: '#ff4500',
          dashArray: '5, 5' // Dashed line for better visibility
        }
      });
      drawHandler.enable();
    },
    flyTo: (lat: number, lng: number, zoom: number) => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([lat, lng], zoom);
      }
    }
  }));

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Fix Leaflet default icon issues
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    const map = L.map(mapContainerRef.current, {
      zoomControl: false // Move zoom control if needed, or keep default
    }).setView([40.39, -111.65], 11); // Mt. Timpanogos
    
    // Add Zoom control to top-left (default)
    L.control.zoom({ position: 'topleft' }).addTo(map);

    mapInstanceRef.current = map;
    
    if (onMapReady) {
      onMapReady(map);
    }

    // Feature Group for drawn items - CRITICAL: Must be added to map
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    // Force high z-index for the selection layer
    (drawnItems as any).setZIndex && (drawnItems as any).setZIndex(1000);
    drawnItemsRef.current = drawnItems;

    // Initialize Draw Control
    const drawControl = new L.Control.Draw({
      draw: {
        polygon: false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
        rectangle: {
          shapeOptions: {
            color: '#ff4500', // Industrial Orange
            weight: 2,
            fillOpacity: 0.2
          }
        }
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });
    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    // Handle Draw Events
    // Use string literals for events to avoid import issues
    map.on('draw:created', (e: any) => {
      console.log("Map: draw:created Event Fired", e);
      const layer = e.layer;
      drawnItems.clearLayers(); // Only allow one selection
      drawnItems.addLayer(layer);
      updateSelection(layer);
    });

    map.on('draw:edited', (e: any) => {
      console.log("Map: draw:edited Event Fired");
      e.layers.eachLayer((layer: any) => {
        updateSelection(layer);
      });
    });
    
    map.on('draw:deleted', () => {
      console.log("Map: draw:deleted Event Fired");
      onBoundsChange(null);
    });

    setIsMapReady(true);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Planet Changes
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;

    const map = mapInstanceRef.current;
    const config = TILE_LAYERS[planet];

    // Remove old layer
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    // Add new layer
    const newLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
    });
    
    newLayer.addTo(map);
    tileLayerRef.current = newLayer;

  }, [planet, isMapReady]);

  const updateSelection = (layer: L.Rectangle) => {
    const bounds = layer.getBounds();
    console.log("Map: Updating Selection Bounds", bounds);
    onBoundsChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    });
  };

  return <div ref={mapContainerRef} className={className || "w-full h-full z-0"} />;
});

export default Map;
