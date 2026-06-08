import dynamic from "next/dynamic";

const ThemeToggle = dynamic(
  () => import("./theme-toggle").then((mod) => mod.ThemeToggle),
  {
    loading: () => (
      <div className="h-9 w-9 rounded-md border border-border bg-muted/60 animate-pulse" />
    ),
  },
);

export function LazyThemeToggle() {
  return <ThemeToggle />;
}
