import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from './Card';

export type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
  comparisonLabel?: string;
  icon?: ReactNode;
  tone?: 'positive' | 'negative' | 'neutral' | 'warning';
};

const toneClasses = {
  positive: 'text-emerald-200',
  negative: 'text-red-200',
  neutral: 'text-fx-text-secondary',
  warning: 'text-amber-200',
} as const;

const ToneIcon = ({ tone }: { tone: NonNullable<StatCardProps['tone']> }) => {
  if (tone === 'positive') return <ArrowUpRight className="h-4 w-4" />;
  if (tone === 'negative') return <ArrowDownRight className="h-4 w-4" />;
  return <Minus className="h-4 w-4" />;
};

export function StatCard({ comparisonLabel, delta, icon, label, tone = 'neutral', value }: StatCardProps) {
  return (
    <Card padding="compact" className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">{label}</p>
          <p className="mt-3 font-mono text-3xl font-semibold text-fx-text-primary">{value}</p>
        </div>
        {icon ? <div className="text-fx-text-secondary">{icon}</div> : null}
      </div>
      {delta ? (
        <div className={`mt-4 flex items-center gap-2 text-sm ${toneClasses[tone]}`}>
          <ToneIcon tone={tone} />
          <span className="font-medium">{delta}</span>
          {comparisonLabel ? <span className="text-fx-text-secondary">{comparisonLabel}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}
