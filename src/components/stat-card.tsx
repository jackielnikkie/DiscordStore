import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
};

export function StatCard({ label, value, detail, icon }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm transition-colors hover:border-border/80">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon ? <span className="-mt-0.5">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground md:text-3xl">{value}</p>
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
