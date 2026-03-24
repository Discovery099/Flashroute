// apps/web/src/features/analytics/components/charts/VolumeChart.tsx
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface VolumeChartProps {
  data: Array<{ date: string; tradeCount: number; volumeUsd: number }>;
}

export function VolumeChart({ data }: VolumeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: 12, color: '#e5e7eb' }}
          formatter={(value, name) => [name === 'tradeCount' ? value : `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, name === 'tradeCount' ? 'Trades' : 'Volume']}
        />
        <Legend formatter={(value: string) => value === 'tradeCount' ? 'Trade Count' : 'Volume (USD)'} />
        <Bar yAxisId="left" dataKey="tradeCount" fill="#06b6d4" name="tradeCount" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="right" dataKey="volumeUsd" fill="#10b981" name="volumeUsd" radius={[4, 4, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
