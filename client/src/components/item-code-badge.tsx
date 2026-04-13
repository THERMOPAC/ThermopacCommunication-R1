import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ItemCodeBadgeProps {
  code: string | null | undefined;
  prop1Label?: string | null;
  className?: string;
}

export function ItemCodeBadge({ code, prop1Label, className = "" }: ItemCodeBadgeProps) {
  if (!code) return <span className="text-muted-foreground">—</span>;

  const parts = code.split("-");
  if (parts.length < 2) {
    return <span className={`font-mono text-[10px] ${className}`}>{code}</span>;
  }

  const family = parts[0];
  const prop1 = parts[1];
  const rest = parts.slice(2).join("-");

  const badge = (
    <span className={`font-mono text-[10px] inline-flex items-center gap-0 ${className}`}>
      <span className="text-muted-foreground">{family}-</span>
      <span className="bg-amber-100 text-amber-800 border border-amber-300 rounded px-0.5 font-semibold">
        {prop1}
      </span>
      {rest && <span className="text-muted-foreground">-{rest}</span>}
    </span>
  );

  if (!prop1Label) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px] max-w-[220px]">
          <p className="font-semibold text-amber-600 mb-0.5">Product Property 1</p>
          <p className="font-mono text-[10px] text-muted-foreground mb-1">{prop1}</p>
          <p>{prop1Label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
