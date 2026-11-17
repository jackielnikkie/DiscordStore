"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function ToggleField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={name} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={name} className="cursor-pointer font-normal">
        {label}
      </Label>
    </div>
  );
}
