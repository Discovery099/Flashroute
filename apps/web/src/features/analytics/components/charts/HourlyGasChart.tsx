// apps/web/src/features/analytics/components/charts/HourlyGasChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface HourlyGasChartProps {
  data: Array<{ hour: string; avgBaseFeeGwei: number | null }>;
}

export function HourlyGasChart({ data }: HourlyGasChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    hourLabel: new Date(d.hour).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="hourLabel" tick={{ fill: '#9ca3af', fontSize: 10 }} interval={2} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v: number) => `${v}gwei`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: 12, color: '#e5e7eb' }}
          formatter={(value) => [`${Number(value).toFixed(2)} gwei`, 'Base Fee']}
        />
        <Legend formatter={(value: string) => value === 'avgBaseFeeGwei' ? 'Base Fee' : 'Priority Fee'} />
        <Line type="monotone" dataKey="avgBaseFeeGwei" stroke="#9ca3af" name="avgBaseFeeGwei" strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
