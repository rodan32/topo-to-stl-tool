/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<MapViewHandle>(null);
 *
 * <MapView
 *   ref={mapRef}
 *   defaultCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   defaultZoom={15}
 *   onMapReady={(map) => {
 *     // map is ready
 *   }}
 * />
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;

// Singleton promise to prevent multiple script loads
let loadPromise: Promise<void> | null = null;

function loadMapScript() {
  if (loadPromise) return loadPromise;
  
  loadPromise = new Promise((resolve) => {
    // Check if google maps is already available
    if (window.google?.maps) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    // Add drawing library for rectangle selection
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry,drawing`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      loadPromise = null; // Reset promise on error so we can try again
    };
    document.head.appendChild(script);
  });
  
  return loadPromise;
}

export interface MapViewHandle {
  map: google.maps.Map | null;
}

interface MapViewProps {
  className?: string;
  defaultCenter?: google.maps.LatLngLiteral;
  defaultZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  options?: google.maps.MapOptions;
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(({
  className,
  defaultCenter = { lat: 37.7749, lng: -122.4194 },
  defaultZoom = 12,
  onMapReady,
  options,
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);

  useImperativeHandle(ref, () => ({
    get map() {
      return mapInstance.current;
    }
  }));

  const init = usePersistFn(async () => {
    await loadMapScript();
    
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    
    // If map already exists, don't re-initialize
    if (mapInstance.current) return;

    mapInstance.current = new window.google.maps.Map(mapContainer.current, {
      zoom: defaultZoom,
      center: defaultCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: true,
      mapId: "DEMO_MAP_ID",
      ...options,
    });
    
    if (onMapReady) {
      onMapReady(mapInstance.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />
  );
});

MapView.displayName = "MapView";

export default MapView;
