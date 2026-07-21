import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MakeOption {
  id: number;
  name: string;
  normalized: string;
}

interface MakeComboboxProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

function normLocal(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function MakeCombobox({ value, onChange, placeholder = "Search or add make…", className, triggerClassName }: MakeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch makes list — refetch when search changes
  const { data: options = [], isFetching } = useQuery<MakeOption[]>({
    queryKey: ["/api/makes", search],
    queryFn: async () => {
      const url = search ? `/api/makes?search=${encodeURIComponent(search)}` : "/api/makes";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load makes");
      return res.json();
    },
    staleTime: 30_000,
  });

  const createMake = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/makes", { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/makes"] });
      onChange(data.name);
      setSearch("");
      setOpen(false);
    },
  });

  // Sync search box with value when popover opens
  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const trimmed = search.trim();
  const normSearch = normLocal(trimmed);
  const exactMatch = options.some((o) => o.normalized === normSearch);
  const showAddOption = trimmed.length > 0 && !exactMatch;

  function handleSelect(name: string) {
    onChange(name);
    setSearch("");
    setOpen(false);
  }

  function handleAdd() {
    if (!trimmed) return;
    createMake.mutate(trimmed);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal h-9 px-3", !value && "text-muted-foreground", triggerClassName)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 w-72", className)} align="start">
        {/* Search box */}
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type to search or add…"
            className="h-7 border-0 p-0 focus-visible:ring-0 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (showAddOption) handleAdd();
                else if (options.length === 1) handleSelect(options[0].name);
              }
            }}
          />
          {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
        </div>

        {/* Options list */}
        <div className="max-h-56 overflow-y-auto py-1">
          {options.length === 0 && !showAddOption && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No makes found. Type a name to add one.</p>
          )}

          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelect(opt.name)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <Check className={cn("h-3.5 w-3.5 shrink-0", value === opt.name ? "opacity-100" : "opacity-0")} />
              {opt.name}
            </button>
          ))}

          {showAddOption && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={createMake.isPending}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50 font-medium"
            >
              {createMake.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                : <Plus className="h-3.5 w-3.5 shrink-0" />}
              Add &ldquo;{trimmed}&rdquo;
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
