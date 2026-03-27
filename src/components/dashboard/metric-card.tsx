import type { LucideIcon } from "lucide-react";

type Tone = "teal" | "amber" | "coral" | "slate";

const toneClassNameMap: Record<
  Tone,
  {
    icon: string;
    halo: string;
    value: string;
  }
> = {
  teal: {
    icon: "bg-[rgba(40,199,111,0.16)] text-[#5be38f]",
    halo: "from-[rgba(40,199,111,0.18)] via-[rgba(40,199,111,0.06)] to-transparent",
    value: "text-[#dcfff0]",
  },
  amber: {
    icon: "bg-[rgba(255,176,32,0.16)] text-[#ffcd6a]",
    halo: "from-[rgba(255,176,32,0.18)] via-[rgba(255,176,32,0.06)] to-transparent",
    value: "text-[#fff0cc]",
  },
  coral: {
    icon: "bg-[rgba(255,91,91,0.16)] text-[#ff8f8f]",
    halo: "from-[rgba(255,91,91,0.18)] via-[rgba(255,91,91,0.06)] to-transparent",
    value: "text-[#ffe2e2]",
  },
  slate: {
    icon: "bg-[rgba(110,168,254,0.14)] text-[#9ec2ff]",
    halo: "from-[rgba(110,168,254,0.18)] via-[rgba(110,168,254,0.05)] to-transparent",
    value: "text-[#e3edff]",
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
          <p className={`mt-3 text-3xl font-extrabold tracking-[-0.03em] ${toneClassName.value}`}>
            {value}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">{detail}</p>
        </div>
        <div
          className={`flex size-12 items-center justify-center rounded-xl border border-white/8 ${toneClassName.icon}`}
        >
          <Icon className="size-5" />
        </div>
      </div>
    </article>
  );
}

