// apps/web/src/features/analytics/components/charts/SuccessRateChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface SuccessRateChartProps {
  data: Array<{ date: string; successRate: number }>;
}

export function SuccessRateChart({ data }: SuccessRateChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: 12, color: '#e5e7eb' }}
          formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Success Rate']}
        />
        <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="successRate" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
