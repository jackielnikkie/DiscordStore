import { CheckCircle2, CircleAlert, MinusCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "neutral";

export function StatusGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
  );
}

export function StatusTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: StatusTone;
}) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <ToneIcon tone={tone} />
        <span className="truncate text-sm font-medium text-foreground">{value}</span>
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SavedState({ saved, masked }: { saved: boolean; masked?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={saved ? "default" : "outline"}>
        {saved ? "Tersimpan" : "Belum diisi"}
      </Badge>
      <span className="font-mono text-xs text-muted-foreground">
        {saved ? masked || "••••" : "-"}
      </span>
    </div>
  );
}

export function WarningList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      {items.map((item) => (
        <p key={item} className="flex items-start gap-2 text-xs text-amber-200">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{item}</span>
        </p>
      ))}
    </div>
  );
}

function ToneIcon({ tone }: { tone: StatusTone }) {
  const className = cn(
    "size-3.5 shrink-0",
    tone === "success" && "text-emerald-500",
    tone === "warning" && "text-amber-500",
    tone === "neutral" && "text-muted-foreground",
  );

  if (tone === "success") return <CheckCircle2 className={className} />;
  if (tone === "warning") return <CircleAlert className={className} />;
  return <MinusCircle className={className} />;
}
