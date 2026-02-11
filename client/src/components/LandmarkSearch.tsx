import { useState, useEffect } from "react";
import { Search, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface LandmarkSearchProps {
  onSelect: (lat: number, lng: number, zoom: number) => void;
  planet: "earth" | "mars" | "moon";
}

const PLANETARY_LANDMARKS = {
  mars: [
    { name: "Olympus Mons", lat: 18.65, lng: 226.2, zoom: 6 },
    { name: "Valles Marineris", lat: -10.0, lng: 287.0, zoom: 5 },
    { name: "Gale Crater (Curiosity)", lat: -5.4, lng: 137.8, zoom: 9 },
    { name: "Jezero Crater (Perseverance)", lat: 18.4, lng: 77.5, zoom: 10 },
    { name: "Tharsis Montes", lat: 0.0, lng: 255.0, zoom: 5 }
  ],
  moon: [
    { name: "Tycho Crater", lat: -43.3, lng: -11.2, zoom: 8 },
    { name: "Copernicus Crater", lat: 9.6, lng: -20.0, zoom: 8 },
    { name: "Apollo 11 Landing Site", lat: 0.67, lng: 23.47, zoom: 10 },
    { name: "South Pole-Aitken Basin", lat: -53.0, lng: 191.0, zoom: 4 },
    { name: "Mare Tranquillitatis", lat: 8.5, lng: 31.4, zoom: 6 }
  ],
  earth: [] // Earth uses dynamic geocoding
};

export default function LandmarkSearch({ onSelect, planet }: LandmarkSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [earthResults, setEarthResults] = useState<any[]>([]);

  // Search Nominatim for Earth natural features
  useEffect(() => {
    if (planet !== "earth" || query.length < 3) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&featuretype=natural`
        );
        const data = await res.json();
        setEarthResults(data);
      } catch (e) {
        console.error("Geocoding failed", e);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, planet]);

  const handleSelect = (lat: number, lng: number, zoom: number) => {
    onSelect(lat, lng, zoom);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[280px] justify-start text-muted-foreground bg-card/95 backdrop-blur border border-border shadow-lg hover:bg-primary/10 hover:text-primary">
          <Search className="mr-2 h-4 w-4" />
          {planet === "earth" ? "Search mountains, canyons..." : "Jump to landmark..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[300px] z-[1100]" align="start">
        <Command>
          <CommandInput 
            placeholder={planet === "earth" ? "Search Earth..." : "Filter landmarks..."} 
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            
            {/* Earth Results */}
            {planet === "earth" && (
              <CommandGroup heading="Geographic Features">
                {earthResults.map((result: any) => (
                  <CommandItem
                    key={result.place_id}
                    onSelect={() => handleSelect(parseFloat(result.lat), parseFloat(result.lon), 10)}
                  >
                    <MapPin className="mr-2 h-4 w-4 opacity-50" />
                    {result.display_name.split(",")[0]}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Planetary Presets */}
            {planet !== "earth" && (
              <CommandGroup heading={`${planet.charAt(0).toUpperCase() + planet.slice(1)} Landmarks`}>
                {PLANETARY_LANDMARKS[planet].map((site) => (
                  <CommandItem
                    key={site.name}
                    onSelect={() => handleSelect(site.lat, site.lng, site.zoom)}
                  >
                    <MapPin className="mr-2 h-4 w-4 opacity-50" />
                    {site.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
