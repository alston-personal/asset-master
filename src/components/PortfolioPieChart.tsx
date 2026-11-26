'use client';

import { Chart as ChartJS, ArcElement, Tooltip, Legend, PieController, Title } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useMemo } from 'react';

ChartJS.register(ArcElement, Tooltip, Legend, PieController, Title);

const DYNAMIC_PALETTE = [
  'rgba(59, 130, 246, 0.85)',   // blue
  'rgba(139, 92, 246, 0.85)',   // purple
  'rgba(236, 72, 153, 0.85)',   // pink
  'rgba(245, 158, 11, 0.85)',   // amber
  'rgba(16, 185, 129, 0.85)',   // emerald
  'rgba(99, 102, 241, 0.85)',   // indigo
  'rgba(244, 63, 94, 0.85)',    // red
  'rgba(20, 184, 166, 0.85)',   // teal
  'rgba(251, 146, 60, 0.85)',   // orange
  'rgba(168, 85, 247, 0.85)',   // violet
  'rgba(34, 211, 238, 0.85)',   // cyan
  'rgba(251, 191, 36, 0.85)',   // yellow
  'rgba(24, 113, 188, 0.85)',   // dark blue
  'rgba(255, 107, 129, 0.85)',  // coral
  'rgba(78, 185, 113, 0.85)',   // green
  'rgba(156, 163, 175, 0.85)',  // gray
];

function getBorderColor(i: number): string {
  return 'rgba(0, 0, 0, 0.3)';
}

interface PortfolioPieChartProps {
  data: {
    symbol: string;
    currentValue: number;
    currentValueUSD?: number;
  }[];
  valueCurrency?: string;
}

export function PortfolioPieChart({ data, valueCurrency = 'USD' }: PortfolioPieChartProps) {
  const chartData = useMemo(() => {
    const total = data.reduce((acc, d) => acc + d.currentValue, 0);

    return {
      labels: data.map(d => d.symbol),
      datasets: [
        {
          data: data.map(d => d.currentValue),
          backgroundColor: data.map((_, i) => DYNAMIC_PALETTE[i % DYNAMIC_PALETTE.length]),
          borderColor: data.map((_, i) => getBorderColor(i)),
          borderWidth: 1,
          hoverOffset: 12,
        },
      ],
    };
  }, [data]);

  const options = useMemo(() => {
    const total = data.reduce((acc, d) => acc + d.currentValue, 0);

    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 12,
            generateLabels(chart: any) {
              const dataset = chart.data.datasets[0];
              const total = dataset.data.reduce((a: number, b: number) => a + b, 0);
              return chart.data.labels.map((label: string, i: number) => ({
                text: `${label}  ${((dataset.data[i] / total) * 100).toFixed(1)}%`,
                fillStyle: dataset.backgroundColor[i],
                strokeStyle: dataset.borderColor[i],
                lineWidth: 1,
                hidden: false,
                index: i,
              }));
            },
          },
        },
        title: {
          display: total > 0,
          text: total > 0 ? `${total.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${valueCurrency}` : '',
          color: 'rgba(255, 255, 255, 0.9)',
          font: { size: 20, weight: 'bold' as const },
          padding: { top: 8, bottom: 8 },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 14,
          titleFont: { size: 14, weight: 'bold' as const },
          bodyFont: { size: 13 },
          displayColors: true,
          cornerRadius: 8,
          callbacks: {
            label(ctx: any) {
              const value = ctx.parsed;
              const percentage = ((value / total) * 100).toFixed(1);
              return `  ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${valueCurrency} (${percentage}%)`;
            },
          },
        },
      },
    };
  }, [data, valueCurrency]);

  return (
    <div className="w-full h-full min-h-[360px] flex items-center justify-center">
      {data.length > 0 ? (
        <div className="w-full max-w-[320px] mx-auto">
          <Pie data={chartData} options={options} />
        </div>
      ) : (
        <div className="text-muted-foreground text-sm italic flex flex-col items-center gap-3 py-10">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>No data to display. Add transactions in the Ledger.</span>
        </div>
      )}
    </div>
  );
}
