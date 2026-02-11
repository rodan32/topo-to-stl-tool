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
  startEditing: () => void;
  flyTo: (lat: number, lng: number, zoom: number) => void;
}

interface MapProps {
  onBoundsChange: (bounds: { north: number; south: number; east: number; west: number } | null) => void;
  className?: string;
  planet: "earth" | "mars" | "moon";
  onMapReady?: (map: L.Map) => void;
  /** Current selection bounds; when set, the map shows this shape. When null, selection is cleared. */
  selectionBounds: { north: number; south: number; east: number; west: number } | null;
  /** Shape to display for the current bounds (rectangle or oval). */
  shape: "rectangle" | "oval";
}

// High-visibility selection rectangle (visible on all map themes)
const RECT_STYLE: L.PathOptions = {
  color: "#e62e00",
  weight: 5,
  opacity: 1,
  fillColor: "#ff6b35",
  fillOpacity: 0.35,
  className: "topo-selection-rect",
};

/** Ellipse points in lat/lng for the given bounds (for oval display). */
function ellipseFromBounds(
  bounds: { north: number; south: number; east: number; west: number },
  numPoints = 48
): L.LatLngLiteral[] {
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const latRadius = (bounds.north - bounds.south) / 2;
  const lngRadius = (bounds.east - bounds.west) / 2;
  const out: L.LatLngLiteral[] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    out.push({
      lat: centerLat + latRadius * Math.sin(angle),
      lng: centerLng + lngRadius * Math.cos(angle),
    });
  }
  return out;
}

const Map = forwardRef<MapRef, MapProps>(({ onBoundsChange, className, planet, onMapReady, selectionBounds, shape }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const customDrawCleanupRef = useRef<(() => void) | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Keep callback ref so draw events always call latest parent state setter
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  // Shape ref so draw logic reads current shape when drawing starts
  const shapeRef = useRef(shape);
  shapeRef.current = shape;

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    startDrawing: () => {
      const map = mapInstanceRef.current;
      const drawnItems = drawnItemsRef.current;
      if (!map || !drawnItems) return;

      // Cancel any in-progress custom draw
      customDrawCleanupRef.current?.();
      customDrawCleanupRef.current = null;

      // Clear existing selection
      drawnItems.clearLayers();
      onBoundsChangeRef.current(null);

      const useOval = shapeRef.current === "oval";
      let startLatLng: L.LatLng | null = null;
      let layer: L.Rectangle | L.Polygon | null = null;

      const updateLayer = (ll: L.LatLng) => {
        if (!layer || !startLatLng) return;
        const lb = L.latLngBounds(startLatLng, ll);
        const b = { north: lb.getNorth(), south: lb.getSouth(), east: lb.getEast(), west: lb.getWest() };
        if (useOval) {
          (layer as L.Polygon).setLatLngs(ellipseFromBounds(b));
        } else {
          (layer as L.Rectangle).setBounds(lb);
        }
      };

      const finish = () => {
        customDrawCleanupRef.current?.();
        customDrawCleanupRef.current = null;
        if (layer && startLatLng) {
          const bounds = layer.getBounds();
          onBoundsChangeRef.current({
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          });
        }
      };

      const onMouseDown = (e: L.LeafletMouseEvent) => {
        map.dragging.disable();
        startLatLng = e.latlng;
        const lb = L.latLngBounds(e.latlng, e.latlng);
        const b = { north: lb.getNorth(), south: lb.getSouth(), east: lb.getEast(), west: lb.getWest() };
        if (useOval) {
          layer = L.polygon(ellipseFromBounds(b), RECT_STYLE);
        } else {
          layer = L.rectangle(lb, RECT_STYLE);
        }
        drawnItems.addLayer(layer);
        layer.bringToFront();

        map.off("mousedown", onMouseDown);
        document.addEventListener("mousemove", onDocMouseMove);
        document.addEventListener("mouseup", onDocMouseUp);
      };

      const onMouseMove = (e: L.LeafletMouseEvent) => {
        if (layer && startLatLng) updateLayer(e.latlng);
      };

      const onDocMouseMove = (e: MouseEvent) => {
        if (!layer || !startLatLng) return;
        try {
          const latlng = map.mouseEventToLatLng(e);
          updateLayer(latlng);
        } catch {
          // ignore if outside map projection
        }
      };

      const onMouseUp = () => {
        map.dragging.enable();
        document.removeEventListener("mousemove", onDocMouseMove);
        document.removeEventListener("mouseup", onDocMouseUp);
        finish();
      };

      const onDocMouseUp = () => {
        onMouseUp();
      };

      const onTouchStart = (e: L.LeafletEvent & { latlng?: L.LatLng }) => {
        const latlng = (e as any).latlng as L.LatLng | undefined;
        if (latlng) {
          map.dragging.disable();
          startLatLng = latlng;
          const lb = L.latLngBounds(latlng, latlng);
          const b = { north: lb.getNorth(), south: lb.getSouth(), east: lb.getEast(), west: lb.getWest() };
          if (useOval) {
            layer = L.polygon(ellipseFromBounds(b), RECT_STYLE);
          } else {
            layer = L.rectangle(lb, RECT_STYLE);
          }
          drawnItems.addLayer(layer);
          layer.bringToFront();
          map.off("touchstart", onTouchStart);
          map.on("touchmove", onTouchMove);
          map.on("touchend", onTouchEnd);
        }
      };
      const onTouchMove = (e: L.LeafletEvent & { latlng?: L.LatLng }) => {
        const latlng = (e as any).latlng as L.LatLng | undefined;
        if (latlng && layer && startLatLng) updateLayer(latlng);
      };
      const onTouchEnd = () => {
        map.dragging.enable();
        map.off("touchmove", onTouchMove);
        map.off("touchend", onTouchEnd);
        finish();
      };

      const cleanup = () => {
        map.dragging.enable();
        map.off("mousedown", onMouseDown);
        document.removeEventListener("mousemove", onDocMouseMove);
        document.removeEventListener("mouseup", onDocMouseUp);
        map.off("touchstart", onTouchStart);
        map.off("touchmove", onTouchMove);
        map.off("touchend", onTouchEnd);
        mapContainerRef.current?.classList.remove("topo-drawing-active");
      };

      customDrawCleanupRef.current = cleanup;
      mapContainerRef.current?.classList.add("topo-drawing-active");
      map.on("mousedown", onMouseDown);
      map.on("touchstart", onTouchStart);
    },
    startEditing: () => {
      const drawControl = drawControlRef.current;
      const drawnItems = drawnItemsRef.current;
      if (!drawControl || !drawnItems || drawnItems.getLayers().length === 0) return;
      const toolbars = (drawControl as any)._toolbars;
      const editToolbar = toolbars?.edit;
      const editHandler = editToolbar?._modes?.edit?.handler;
      if (editHandler && !editHandler._enabled) {
        editHandler.enable();
      }
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

    // Feature Group for drawn items; add to map
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;


    // Initialize Draw Control (edit/delete only; rectangle drawing is custom — leaflet-draw 1.0.4 rectangle is broken)
    const drawControl = new L.Control.Draw({
      draw: {
        polygon: false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
        rectangle: false
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });
    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    // Handle Draw Events — use ref so parent state always updates
    const notifyBounds = (bounds: { north: number; south: number; east: number; west: number } | null) => {
      onBoundsChangeRef.current(bounds);
    };

    function getBoundsFromLayer(layer: any): L.LatLngBounds | null {
      if (typeof layer.getBounds === 'function') {
        return layer.getBounds();
      }
      const latlngs = typeof layer.getLatLngs === 'function' ? layer.getLatLngs() : null;
      if (latlngs && latlngs.length > 0) {
        const first = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
        return L.latLngBounds(first as L.LatLng[]);
      }
      return null;
    }

    const updateSelection = (layer: any) => {
      const bounds = getBoundsFromLayer(layer);
      if (!bounds) return;
      notifyBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });
    };

    const onDrawCreated = (e: any) => {
      const layer = e.layer;
      if (!layer) return;
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);
      if (layer.bringToFront) layer.bringToFront();
      updateSelection(layer);
    };

    const onDrawEdited = (e: any) => {
      e.layers.eachLayer((layer: any) => updateSelection(layer));
    };

    map.on(L.Draw.Event.CREATED, onDrawCreated);
    map.on(L.Draw.Event.EDITED, onDrawEdited);
    map.on(L.Draw.Event.DELETED, () => notifyBounds(null));

    // Ensure map has correct size so draw events hit the map (critical for selection)
    const container = mapContainerRef.current;
    const scheduleInvalidate = () => {
      requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => map.invalidateSize(), 0);
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 400);
    };
    scheduleInvalidate();
    const resizeObserver =
      container && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleInvalidate)
        : null;
    if (resizeObserver && container) resizeObserver.observe(container);

    setIsMapReady(true);

    return () => {
      map.off(L.Draw.Event.CREATED, onDrawCreated);
      map.off(L.Draw.Event.EDITED, onDrawEdited);
      map.off(L.Draw.Event.DELETED);
      resizeObserver?.disconnect();
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

  // Sync drawn selection to match current bounds and shape (rectangle vs oval)
  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    const map = mapInstanceRef.current;
    if (!drawnItems || !map || !isMapReady) return;

    drawnItems.clearLayers();
    if (!selectionBounds) return;

    const b = selectionBounds;
    const leafletBounds = L.latLngBounds(
      [b.south, b.west],
      [b.north, b.east]
    );

    if (shape === "oval") {
      const latlngs = ellipseFromBounds(b);
      const layer = L.polygon(latlngs, RECT_STYLE);
      drawnItems.addLayer(layer);
      layer.bringToFront();
    } else {
      const layer = L.rectangle(leafletBounds, RECT_STYLE);
      drawnItems.addLayer(layer);
      layer.bringToFront();
    }
  }, [selectionBounds, shape, isMapReady]);

  return (
    <div
      ref={mapContainerRef}
      className={className || "absolute inset-0 w-full h-full min-h-[400px] z-0"}
      style={{ touchAction: "none" }}
    />
  );
});

export default Map;
