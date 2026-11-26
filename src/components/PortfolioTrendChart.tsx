'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export interface TrendPoint {
  date: string;
  totalValue: number;
  totalCost: number;
  unrealizedGainLoss: number;
  transactionCount?: number;
}

interface PortfolioTrendChartProps {
  data: TrendPoint[];
  loading?: boolean;
  valueCurrency?: string;
}

export function PortfolioTrendChart({
  data = [],
  loading = false,
  valueCurrency = 'USD',
}: PortfolioTrendChartProps) {
  const { colorScheme } = useSettings();

  const isUp = useMemo(() => {
    if (!data || data.length === 0) return true;
    const latest = data[data.length - 1];
    return latest.unrealizedGainLoss >= 0;
  }, [data]);

  // Determine positive/negative stroke based on color scheme
  // TW: Red is positive (+), Green is negative (-)
  // US / default: Green is positive (+), Red is negative (-)
  const gainColor = useMemo(() => {
    if (colorScheme === 'TW') {
      return isUp ? 'rgba(244, 63, 94, 1)' : 'rgba(16, 185, 129, 1)';
    }
    return isUp ? 'rgba(16, 185, 129, 1)' : 'rgba(244, 63, 94, 1)';
  }, [colorScheme, isUp]);

  const gainBgColor = useMemo(() => {
    if (colorScheme === 'TW') {
      return isUp ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)';
    }
    return isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
  }, [colorScheme, isUp]);

  const chartData = useMemo(() => {
    const labels = data.map((d) => d.date);
    const gainLossData = data.map((d) => d.unrealizedGainLoss);
    const valueData = data.map((d) => d.totalValue);
    const costData = data.map((d) => d.totalCost);

    return {
      labels,
      datasets: [
        {
          label: 'Unrealized P/L',
          data: gainLossData,
          borderColor: gainColor,
          backgroundColor: gainBgColor,
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: data.length > 30 ? 0 : 3,
          pointHoverRadius: 6,
          yAxisID: 'y',
        },
        {
          label: 'Total Value',
          data: valueData,
          borderColor: 'rgba(59, 130, 246, 0.85)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 5,
          yAxisID: 'y1',
        },
        {
          label: 'Total Cost',
          data: costData,
          borderColor: 'rgba(156, 163, 175, 0.6)',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [2, 2],
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 5,
          yAxisID: 'y1',
        },
      ],
    };
  }, [data, gainColor, gainBgColor]);

  const options: ChartOptions<'line'> = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top' as const,
          align: 'end' as const,
          labels: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { size: 12 },
            usePointStyle: true,
            boxWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          titleFont: { size: 13, weight: 'bold' as const },
          bodyFont: { size: 12 },
          cornerRadius: 8,
          callbacks: {
            label(ctx) {
              const val = ctx.parsed.y;
              const formatted = val !== null && val !== undefined
                ? Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })
                : '0';
              return ` ${ctx.dataset.label}: ${formatted} ${valueCurrency}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7,
          },
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
          ticks: {
            color: gainColor,
            callback: (v) => `${Number(v).toLocaleString()} ${valueCurrency}`,
          },
          title: {
            display: true,
            text: `P/L (${valueCurrency})`,
            color: 'rgba(255, 255, 255, 0.5)',
            font: { size: 11 },
          },
        },
        y1: {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: 'rgba(59, 130, 246, 0.7)',
            callback: (v) => `${Number(v).toLocaleString()} ${valueCurrency}`,
          },
          title: {
            display: true,
            text: `Asset Value (${valueCurrency})`,
            color: 'rgba(255, 255, 255, 0.5)',
            font: { size: 11 },
          },
        },
      },
    };
  }, [gainColor, valueCurrency]);

  if (loading) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3 text-muted-foreground text-sm">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Loading trend data...</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center">
        <div className="text-muted-foreground text-sm italic flex flex-col items-center gap-3 py-10">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>No historical transactions found to compute trend.</span>
        </div>
      </div>
    );
  }

  const latest = data[data.length - 1];
  const totalGain = latest?.unrealizedGainLoss ?? 0;

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase font-semibold">Latest P/L</span>
          <span className={`text-sm font-bold flex items-center gap-1 ${
            totalGain >= 0
              ? (colorScheme === 'TW' ? 'text-rose-400' : 'text-emerald-400')
              : (colorScheme === 'TW' ? 'text-emerald-400' : 'text-rose-400')
          }`}>
            {totalGain >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {totalGain >= 0 ? '+' : ''}{totalGain.toLocaleString(undefined, { maximumFractionDigits: 2 })} {valueCurrency}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {data.length} snapshots recorded
        </div>
      </div>

      <div className="w-full h-[320px]">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
