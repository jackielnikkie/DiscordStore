export default function AdminLoading() {
  return (
    <main className="space-y-5 p-4 md:p-6">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-md bg-muted/70 animate-pulse" />
        <div className="h-4 w-72 rounded-md bg-muted/60 animate-pulse" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 rounded-xl border bg-card shadow-sm">
            <div className="space-y-3 p-4">
              <div className="h-4 w-24 rounded-md bg-muted/60 animate-pulse" />
              <div className="h-8 w-32 rounded-md bg-muted/70 animate-pulse" />
              <div className="h-4 w-20 rounded-md bg-muted/50 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
