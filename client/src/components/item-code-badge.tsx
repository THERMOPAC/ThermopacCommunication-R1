interface ItemCodeBadgeProps {
  code: string | null | undefined;
  prop1Label?: string | null;
  className?: string;
}

export function ItemCodeBadge({ code, className = "" }: ItemCodeBadgeProps) {
  if (!code) return <span className="text-muted-foreground">—</span>;
  return <span className={`font-mono text-[10px] ${className}`}>{code}</span>;
}
