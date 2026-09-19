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
}: {
  geometry: unknown;
  view: Stage5View;
  active: boolean;
  onSelect: (view: Stage5View) => void;
  frozenSvg?: string;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const rawSvg = frozenSvg ?? renderStage5Svg(geometry as never, view);
  // The renderer appends a deep printable schedule below the drawing. The
  // workspace intentionally fits the complete drawing sheet (0–600) here;
  // the same schedules are exposed beside it rather than clipped in a 310px
  // viewport. Export keeps the untouched, full frozen SVG.
  const svg = rawSvg.replace(/height="[^"]+"/, 'height="600"').replace(/viewBox="0 0 1100 [^"]+"/, 'viewBox="0 0 1100 600"');
  const changeZoom = (delta: number) => setScale(current => Math.min(2.2, Math.max(.55, current + delta)));

  return (
    <section data-testid={`stage5-drawing-${view}`} className={`overflow-hidden rounded-md border ${active ? "border-cyan-700 ring-1 ring-cyan-700/30" : "border-slate-300"} bg-white`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <button type="button" onClick={() => onSelect(view)} className="text-left text-xs font-semibold text-slate-900">
          {viewNames[view]}
        </button>
        {active && (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Zoom out" onClick={() => changeZoom(-.2)} className="h-6 w-6"><Minus className="h-3 w-3" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Reset drawing view" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="h-6 w-6"><RotateCcw className="h-3 w-3" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Zoom in" onClick={() => changeZoom(.2)} className="h-6 w-6"><Plus className="h-3 w-3" /></Button>
          </div>
        )}
      </div>
      <div
        className={`relative aspect-[11/6] min-h-[210px] overflow-hidden bg-[#f4f5f1] ${active ? "cursor-grab" : ""}`}
        onPointerDown={(event) => {
          if (!active) return;
          const origin = { x: event.clientX - offset.x, y: event.clientY - offset.y };
          const move = (next: PointerEvent) => setOffset({ x: next.clientX - origin.x, y: next.clientY - origin.y });
          const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", end);
        }}
      >
        {active && <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded border border-slate-300 bg-white/90 px-1.5 py-1 font-mono text-[9px] text-slate-500"><Move className="h-3 w-3" /> {Math.round(scale * 100)}%</span>}
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