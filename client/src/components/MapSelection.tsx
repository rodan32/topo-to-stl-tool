import { useEffect, useRef, useState } from "react";
import MapView, { type MapViewHandle } from "@/components/Map";

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MapSelectionProps {
  onSelectionChange: (bounds: Bounds) => void;
  className?: string;
}

export default function MapSelection({ onSelectionChange, className }: MapSelectionProps) {
  const mapRef = useRef<MapViewHandle>(null);
  const [rectangle, setRectangle] = useState<google.maps.Rectangle | null>(null);
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);

  const handleMapReady = (map: google.maps.Map) => {
    // Initialize Drawing Manager
    const dm = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [google.maps.drawing.OverlayType.RECTANGLE],
      },
      rectangleOptions: {
        fillColor: "#ff5500", // Industrial Orange
        fillOpacity: 0.2,
        strokeWeight: 2,
        strokeColor: "#ff5500",
        clickable: true,
        editable: true,
        draggable: true,
        zIndex: 1,
      },
    });

    dm.setMap(map);
    setDrawingManager(dm);

    // Listen for rectangle completion
    google.maps.event.addListener(dm, "overlaycomplete", (event: google.maps.drawing.OverlayCompleteEvent) => {
      if (event.type === google.maps.drawing.OverlayType.RECTANGLE) {
        // Remove previous rectangle if exists
        if (rectangle) {
          rectangle.setMap(null);
        }

        const newRect = event.overlay as google.maps.Rectangle;
        setRectangle(newRect);

        // Switch back to non-drawing mode to avoid drawing multiple rectangles
        dm.setDrawingMode(null);

        // Update bounds
        updateBounds(newRect);

        // Listen for changes to the rectangle
        newRect.addListener("bounds_changed", () => updateBounds(newRect));
      }
    });
  };

  const updateBounds = (rect: google.maps.Rectangle) => {
    const bounds = rect.getBounds();
    if (bounds) {
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      
      onSelectionChange({
        north: ne.lat(),
        south: sw.lat(),
        east: ne.lng(),
        west: sw.lng(),
      });
    }
  };

  // Clean up previous rectangle when a new one is drawn (handled in overlaycomplete)
  // But we also need to handle if the component unmounts or resets
  useEffect(() => {
    return () => {
      if (rectangle) {
        rectangle.setMap(null);
      }
      if (drawingManager) {
        drawingManager.setMap(null);
      }
    };
  }, []);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <MapView
        ref={mapRef}
        defaultCenter={{ lat: 40.3916, lng: -111.5708 }} // Mt. Timpanogos, Utah
        defaultZoom={12}
        onMapReady={handleMapReady}
        className="w-full h-full rounded-none"
        options={{
          mapTypeId: "terrain",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          styles: [
            {
              featureType: "all",
              elementType: "labels.text.fill",
              stylers: [{ color: "#ffffff" }]
            },
            {
              featureType: "all",
              elementType: "labels.text.stroke",
              stylers: [{ color: "#000000" }, { lightness: 13 }]
            },
            {
              featureType: "administrative",
              elementType: "geometry.fill",
              stylers: [{ color: "#000000" }]
            },
            {
              featureType: "administrative",
              elementType: "geometry.stroke",
              stylers: [{ color: "#144b53" }, { lightness: 14 }, { weight: 1.4 }]
            },
            {
              featureType: "landscape",
              elementType: "all",
              stylers: [{ color: "#08304b" }]
            },
            {
              featureType: "poi",
              elementType: "geometry",
              stylers: [{ color: "#0c4152" }, { lightness: 5 }]
            },
            {
              featureType: "road.highway",
              elementType: "geometry.fill",
              stylers: [{ color: "#000000" }]
            },
            {
              featureType: "road.highway",
              elementType: "geometry.stroke",
              stylers: [{ color: "#0b434f" }, { lightness: 25 }]
            },
            {
              featureType: "road.arterial",
              elementType: "geometry.fill",
              stylers: [{ color: "#000000" }]
            },
            {
              featureType: "road.arterial",
              elementType: "geometry.stroke",
              stylers: [{ color: "#0b3d51" }, { lightness: 16 }]
            },
            {
              featureType: "road.local",
              elementType: "geometry",
              stylers: [{ color: "#000000" }]
            },
            {
              featureType: "transit",
              elementType: "all",
              stylers: [{ color: "#146474" }]
            },
            {
              featureType: "water",
              elementType: "all",
              stylers: [{ color: "#021019" }]
            }
          ]
        }}
      />
      
      {/* Overlay Instructions */}
      {!rectangle && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm text-primary-foreground px-4 py-2 rounded border border-primary/30 pointer-events-none font-mono text-sm z-10">
          DRAW A RECTANGLE TO SELECT AREA
        </div>
      )}
    </div>
  );
}
