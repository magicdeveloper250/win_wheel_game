import { cn } from "@/lib/utils";

export default function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 6,
    password.length >= 10,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const levels = [
    { label: "Too short",  color: "bg-destructive" },
    { label: "Weak",       color: "bg-orange-500"  },
    { label: "Fair",       color: "bg-yellow-500"  },
    { label: "Good",       color: "bg-sky-500"     },
    { label: "Strong",     color: "bg-emerald-500" },
  ];
  const level = levels[Math.max(0, score - 1)] ?? levels[0];

  if (!password) return null;

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex gap-1">
        {levels.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-300",
              i < score ? level.color : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className={cn("text-xs font-medium", level.color.replace("bg-", "text-"))}>
        {level.label}
      </p>
    </div>
  );
}