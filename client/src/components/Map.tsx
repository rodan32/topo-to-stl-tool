import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

// Define tile layers for each planet
const TILE_LAYERS = {
  earth: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
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

interface MapProps {
  onBoundsChange: (bounds: { north: number; south: number; east: number; west: number } | null) => void;
  className?: string;
  planet: "earth" | "mars" | "moon";
  onMapReady?: (map: L.Map) => void;
}

export default function Map({ onBoundsChange, className, planet, onMapReady }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

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

    const map = L.map(mapContainerRef.current).setView([40.39, -111.65], 11); // Mt. Timpanogos
    mapInstanceRef.current = map;
    
    if (onMapReady) {
      onMapReady(map);
    }

    // Feature Group for drawn items
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
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
            weight: 2
          }
        }
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });
    map.addControl(drawControl);

    // Handle Draw Events
    map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      drawnItems.clearLayers(); // Only allow one selection
      drawnItems.addLayer(layer);
      updateSelection(layer);
    });

    map.on(L.Draw.Event.EDITED, (e: any) => {
      e.layers.eachLayer((layer: any) => {
        updateSelection(layer);
      });
    });
    
    map.on(L.Draw.Event.DELETED, () => {
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
    onBoundsChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    });
  };

  return <div ref={mapContainerRef} className={className || "w-full h-full"} />;
}
