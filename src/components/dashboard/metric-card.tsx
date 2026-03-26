import type { LucideIcon } from "lucide-react";

type Tone = "teal" | "amber" | "coral" | "slate";

const toneClassNameMap: Record<
  Tone,
  {
    icon: string;
    halo: string;
  }
> = {
  teal: {
    icon: "bg-emerald-100 text-emerald-700",
    halo: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  amber: {
    icon: "bg-amber-100 text-amber-700",
    halo: "from-amber-500/20 via-amber-500/5 to-transparent",
  },
  coral: {
    icon: "bg-rose-100 text-rose-700",
    halo: "from-rose-500/20 via-rose-500/5 to-transparent",
  },
  slate: {
    icon: "bg-slate-100 text-slate-700",
    halo: "from-slate-500/20 via-slate-500/5 to-transparent",
  },
};

interface MetricCardProps {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: string;
  detail: string;
}

export function MetricCard({
  icon: Icon,
  tone,
  label,
  value,
  detail,
}: MetricCardProps) {
  const toneClassName = toneClassNameMap[tone];

  return (
    <article className="surface-card relative overflow-hidden p-5">
      <div
        className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${toneClassName.halo}`}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="stat-note">{label}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-2 text-sm text-slate-600">{detail}</p>
        </div>
        <div
          className={`flex size-12 items-center justify-center rounded-xl ${toneClassName.icon}`}
        >
          <Icon className="size-5" />
        </div>
      </div>
    </article>
  );
}
