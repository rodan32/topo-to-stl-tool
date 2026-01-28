import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

// Fix for default marker icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  onSelectionChange: (bounds: { north: number; south: number; east: number; west: number }) => void;
  className?: string;
  planet: "earth" | "mars" | "moon";
}

export default function Map({ onSelectionChange, className, planet }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (mapRef.current) return; // Initialize only once

    // Initialize map
    const map = L.map(mapContainer.current).setView([40.39, -111.65], 10); // Mt. Timpanogos
    mapRef.current = map;

    // Add tile layer
    const getTileUrl = (p: string) => {
      if (p === 'mars') return 'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-1/all/{z}/{x}/{y}.png';
      if (p === 'moon') return 'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/{z}/{x}/{y}.png';
      return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    };

    const tileLayer = L.tileLayer(getTileUrl(planet), {
      attribution: planet === 'earth' ? '&copy; OpenStreetMap contributors' : 'NASA/USGS/OpenPlanetary',
      maxZoom: 18
    }).addTo(map);

    // Store reference to update later
    (map as any)._tileLayer = tileLayer;

    // Initialize drawing feature group
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    // Add draw control
    const drawControl = new L.Control.Draw({
      draw: {
        polyline: false,
        polygon: false,
        circle: false,
        marker: false,
        circlemarker: false,
        rectangle: {
          shapeOptions: {
            color: '#f97316', // Orange-500
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
    drawControlRef.current = drawControl;

    // Handle creation
    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnItems.clearLayers(); // Only allow one selection
      const layer = e.layer;
      drawnItems.addLayer(layer);
      
      const bounds = layer.getBounds();
      onSelectionChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });
    });

    // Handle edit
    map.on(L.Draw.Event.EDITED, (e: any) => {
      e.layers.eachLayer((layer: any) => {
        const bounds = layer.getBounds();
        onSelectionChange({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        });
      });
    });

    // Handle delete
    map.on(L.Draw.Event.DELETED, () => {
      // onSelectionChange(null); // Type doesn't allow null currently, maybe handle upstream or ignore
    });

    // Force map invalidation to resize correctly
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // Run once on mount

  // Effect to update tiles when planet changes
  useEffect(() => {
    if (mapRef.current && (mapRef.current as any)._tileLayer) {
      const map = mapRef.current;
      const layer = (map as any)._tileLayer;
      
      const getTileUrl = (p: string) => {
        if (p === 'mars') return 'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-1/all/{z}/{x}/{y}.png';
        if (p === 'moon') return 'https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/{z}/{x}/{y}.png';
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      };

      layer.setUrl(getTileUrl(planet));
      
      // Update attribution
      map.attributionControl.removeAttribution('&copy; OpenStreetMap contributors');
      map.attributionControl.removeAttribution('NASA/USGS/OpenPlanetary');
      map.attributionControl.addAttribution(planet === 'earth' ? '&copy; OpenStreetMap contributors' : 'NASA/USGS/OpenPlanetary');
    }
  }, [planet]);

  return <div ref={mapContainer} className={className} />;
}
