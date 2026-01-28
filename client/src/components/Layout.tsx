import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
  className?: string;
}

export default function Layout({ children, className }: LayoutProps) {
  return (
    <div className={cn("relative w-full h-screen overflow-hidden bg-background text-foreground flex flex-col", className)}>
      {/* Header Bar */}
      <header className="absolute top-0 left-0 right-0 h-16 z-50 flex items-center justify-between px-6 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="w-8 h-8 bg-primary flex items-center justify-center text-primary-foreground font-bold font-sans">
            T
          </div>
          <h1 className="text-xl font-bold tracking-wider font-sans uppercase">
            Topo<span className="text-primary">2</span>STL
          </h1>
        </div>
        
        <div className="flex items-center gap-4 pointer-events-auto">
          <a 
            href="https://github.com/rodan32/topo-to-stl" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm font-mono opacity-70 hover:opacity-100 hover:text-primary transition-colors"
          >
            GITHUB_REPO
          </a>
        </div>
      </header>

      {/* Main Content (Map) */}
      <main className="flex-1 relative z-0">
        {children}
      </main>

      {/* Footer / Status Bar */}
      <footer className="absolute bottom-0 left-0 right-0 h-8 bg-card/90 backdrop-blur border-t border-border z-50 flex items-center justify-between px-4 text-xs font-mono text-muted-foreground pointer-events-none">
        <div className="flex items-center gap-4">
          <span>STATUS: <span className="text-green-500">ONLINE</span></span>
          <span>SYSTEM: READY</span>
        </div>
        <div className="flex items-center gap-4">
          <span>V1.0.0</span>
          <span>RODAN32</span>
        </div>
      </footer>
    </div>
  );
}
