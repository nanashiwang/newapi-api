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
    icon: "bg-[#dff7f2] text-[#0f766e]",
    halo: "from-[#0f766e]/18 via-[#0f766e]/6 to-transparent",
  },
  amber: {
    icon: "bg-[#fff0ca] text-[#c57700]",
    halo: "from-[#c57700]/18 via-[#c57700]/6 to-transparent",
  },
  coral: {
    icon: "bg-[#ffe2da] text-[#d96749]",
    halo: "from-[#d96749]/18 via-[#d96749]/6 to-transparent",
  },
  slate: {
    icon: "bg-[#e9eef0] text-[#324047]",
    halo: "from-[#324047]/18 via-[#324047]/6 to-transparent",
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
          <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[#1d2529]">
            {value}
          </p>
          <p className="mt-2 text-sm text-[#5c6d71]">{detail}</p>
        </div>
        <div
          className={`flex size-12 items-center justify-center rounded-2xl ${toneClassName.icon}`}
        >
          <Icon className="size-5" />
        </div>
      </div>
    </article>
  );
}
