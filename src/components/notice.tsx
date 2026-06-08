type NoticeProps = {
  message?: string;
  error?: string;
};

export function Notice({ message, error }: NoticeProps) {
  if (!message && !error) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        error
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : "border-primary/20 bg-primary/5 text-muted-foreground"
      }`}
    >
      {error || message}
    </div>
  );
}
