import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";

interface DueDateFilterProps {
  defaultValue?: number;
  onChange: (days: number | null) => void;
}

export function DueDateFilter({ defaultValue = 30, onChange }: DueDateFilterProps) {
  const [days, setDays] = useState<number | null>(defaultValue);

  const handleChange = (value: number | null) => {
    setDays(value);
    onChange(value);
  };

  return (
    <div className="space-y-3 border p-4 rounded-md bg-white">
      <div className="flex items-center justify-between">
        <Label htmlFor="date-range" className="font-medium">Due Date Range</Label>
        {days !== null && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleChange(null)}
            className="h-7 px-2"
          >
            Clear
          </Button>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        <Input
          id="date-range"
          type="number"
          value={days !== null ? days : ""}
          onChange={(e) => {
            const value = e.target.value === "" ? null : Number(e.target.value);
            handleChange(value);
          }}
          min="1"
          className="w-20"
        />
        <span className="text-sm text-gray-500">days</span>
        {days !== null && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleChange(30)}
            className="h-7 px-3 text-xs"
          >
            Reset to 30
          </Button>
        )}
      </div>
      
      <p className="text-xs text-gray-500">
        {days !== null 
          ? `Shows tasks due within the next ${days} days` 
          : "Shows all tasks regardless of due date"}
      </p>
    </div>
  );
}