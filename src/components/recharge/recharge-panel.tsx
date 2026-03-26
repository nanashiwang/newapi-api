"use client";

import { useState } from "react";
import { CreditCard, DollarSign, History, Loader2 } from "lucide-react";

interface RechargePanelProps {
  siteId: string;
  siteName: string;
  currentBalance: number | null;
  onRecharge: (amount: number) => Promise<void>;
}

const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];

export function RechargePanel({
  siteName,
  currentBalance,
  onRecharge,
}: RechargePanelProps) {
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history] = useState<Array<{ date: string; amount: number }>>([]);

  const handleQuickAmount = (value: number) => {
    setAmount(value.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await onRecharge(numAmount);
      setAmount("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="surface-card p-6">
      <div className="border-b border-black/5 pb-5">
        <p className="stat-note">Recharge</p>
        <h2 className="section-title mt-2">{siteName} - 充值管理</h2>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="rounded-2xl bg-gradient-to-br from-[#dff7f2] to-white p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-14 items-center justify-center rounded-xl bg-[#0f766e] text-white">
                <DollarSign className="size-7" />
              </div>
              <div>
                <p className="text-sm text-[#5c6d71]">当前余额</p>
                <p className="text-3xl font-bold text-[#1d2529]">
                  ${currentBalance?.toFixed(2) ?? "--"}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="field-label">充值金额 (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="输入充值金额"
                className="field-input mt-2"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <p className="field-label mb-3">快速选择</p>
              <div className="grid grid-cols-3 gap-2">
                {QUICK_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleQuickAmount(value)}
                    className="secondary-button justify-center"
                    disabled={isSubmitting}
                  >
                    ${value}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!amount || isSubmitting}
              className="primary-button w-full justify-center"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  充值中...
                </>
              ) : (
                <>
                  <CreditCard className="size-4" />
                  确认充值
                </>
              )}
            </button>
          </form>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <History className="size-5 text-[#5c6d71]" />
            <h3 className="text-sm font-semibold text-[#1d2529]">充值历史</h3>
          </div>

          {history.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-[#fbfaf5] p-8 text-center text-sm text-[#5c6d71]">
              暂无充值记录
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {history.map((record, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-white p-4"
                >
                  <span className="text-sm text-[#4f5d62]">{record.date}</span>
                  <span className="font-semibold text-[#0f766e]">+${record.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
