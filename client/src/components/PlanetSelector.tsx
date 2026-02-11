import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";

export type Planet = "earth" | "mars" | "moon" | "venus";

interface PlanetSelectorProps {
  value: Planet;
  onChange: (value: Planet) => void;
}

export default function PlanetSelector({ value, onChange }: PlanetSelectorProps) {
  return (
    <div className="flex items-center space-x-2">
      <Globe className="w-4 h-4 text-muted-foreground" />
      <Select value={value} onValueChange={(v) => onChange(v as Planet)}>
        <SelectTrigger className="w-[120px] h-8 text-xs bg-background/50 backdrop-blur border-primary/20">
          <SelectValue placeholder="Select Planet" />
        </SelectTrigger>
        <SelectContent className="z-[1100]">
          <SelectItem value="earth">Earth</SelectItem>
          <SelectItem value="mars">Mars</SelectItem>
          <SelectItem value="moon">Moon</SelectItem>
          <SelectItem value="venus">Venus</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
