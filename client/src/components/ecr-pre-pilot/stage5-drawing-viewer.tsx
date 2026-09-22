import { Minus, Move, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { renderStage5Svg } from "@shared/ecr-stage5-drawings";

export type Stage5View = "ga" | "section" | "compartment" | "rotor" | "stator";

const viewNames: Record<Stage5View, string> = {
  ga: "General arrangement",
  section: "Longitudinal section",
  compartment: "Typical compartment",
  rotor: "Rotor detail",
  stator: "Stator detail",
};

export function Stage5DrawingViewer({
  geometry,
  view,
  active,
  onSelect,
  frozenSvg,
  projectionSvg,
}: {
  geometry: unknown;
  view: Stage5View;
  active: boolean;
  onSelect: (view: Stage5View) => void;
  frozenSvg?: string;
  /** Ephemeral, source-checked current projection; never a saved drawing. */
  projectionSvg?: string;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const rawSvg = projectionSvg ?? frozenSvg ?? renderStage5Svg(geometry as never, view);
  const svg = rawSvg;
  const viewport = rawSvg.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)["']/);
  const aspectRatio = viewport ? `${viewport[1]} / ${viewport[2]}` : "11 / 6";
  const changeZoom = (delta: number) => setScale(current => Math.min(2.2, Math.max(.55, current + delta)));

  return (
    <section data-testid={`stage5-drawing-${view}`} className={`overflow-hidden rounded-md border ${active ? "border-cyan-700 ring-1 ring-cyan-700/30" : "border-slate-300"} bg-white`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <button type="button" onClick={() => onSelect(view)} className="text-left text-xs font-semibold text-slate-900">
          {projectionSvg ? "Current conditional general arrangement" : viewNames[view]}
        </button>
        {active && (
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-1 px-1 font-mono text-[10px] text-slate-500"><Move className="h-3 w-3" /> {Math.round(scale * 100)}%</span>
            <Button type="button" variant="ghost" size="icon" aria-label="Zoom out" onClick={() => changeZoom(-.2)} className="h-6 w-6"><Minus className="h-3 w-3" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Reset drawing view" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="h-6 w-6"><RotateCcw className="h-3 w-3" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Zoom in" onClick={() => changeZoom(.2)} className="h-6 w-6"><Plus className="h-3 w-3" /></Button>
          </div>
        )}
      </div>
      <div
        style={{ aspectRatio }}
        className={`relative min-h-[210px] overflow-hidden bg-[#f4f5f1] ${active ? "cursor-grab" : ""}`}
        onPointerDown={(event) => {
          if (!active) return;
          const origin = { x: event.clientX - offset.x, y: event.clientY - offset.y };
          const move = (next: PointerEvent) => setOffset({ x: next.clientX - origin.x, y: next.clientY - origin.y });
          const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", end);
        }}
      >
        <div
          className="[&_svg]:h-full [&_svg]:w-full h-full w-full origin-center transition-transform duration-150"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </section>
  );
}

export const stage5ViewNames = viewNames;