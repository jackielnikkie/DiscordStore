export default function AdminLoading() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:block">
        <div className="space-y-4 p-4">
          <div className="h-10 w-full rounded-lg bg-muted/70 animate-pulse" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-9 w-full rounded-md bg-muted/60 animate-pulse"
              />
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b px-4">
          <div className="h-6 w-16 rounded-full bg-muted/60 animate-pulse" />
          <div className="h-6 w-20 rounded-full bg-muted/60 animate-pulse" />
          <div className="h-9 w-9 rounded-md bg-muted/60 animate-pulse" />
        </header>

        <main className="space-y-5 p-4 md:p-6">
          <div className="space-y-2">
            <div className="h-8 w-48 rounded-md bg-muted/70 animate-pulse" />
            <div className="h-4 w-72 rounded-md bg-muted/60 animate-pulse" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-32 rounded-xl border bg-card shadow-sm"
              >
                <div className="space-y-3 p-4">
                  <div className="h-4 w-24 rounded-md bg-muted/60 animate-pulse" />
                  <div className="h-8 w-32 rounded-md bg-muted/70 animate-pulse" />
                  <div className="h-4 w-20 rounded-md bg-muted/50 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
