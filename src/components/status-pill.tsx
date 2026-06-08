type StatusPillProps = {
  label: string;
  tone?: "success" | "warning" | "danger" | "neutral" | "info";
};

const tones: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  success: "border-transparent bg-green-500/15 text-green-700 dark:text-green-400",
  warning: "border-transparent bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  danger: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
  neutral: "border-transparent bg-gray-500/15 text-gray-700 dark:text-gray-300",
  info: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return <span className={`badge ${tones[tone]}`}>{label}</span>;
}
