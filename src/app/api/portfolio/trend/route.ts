import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStockQuotes, getCryptoQuotes, getExchangeRates } from '@/lib/finance';

export async function GET() {
  try {
    // Fetch all transactions ordered chronologically
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: 'asc' },
    });

    if (transactions.length === 0) {
      return NextResponse.json({ data: [], totalValue: 0, totalCost: 0, unrealizedGainLoss: 0 });
    }

    // Accumulate values over time
    let cumulativeQuantity: Record<string, number> = {};
    let cumulativeCost: Record<string, number> = {};
    let cumulativeCashFlow = 0; // DEPOSIT adds, WITHDRAW subtracts

    const trendPoints: any[] = [];

    // Group transactions by date for cleaner points
    const transactionsByDate = new Map<string, typeof transactions>();
    for (const t of transactions) {
      const dateKey = t.date.toISOString().split('T')[0];
      if (!transactionsByDate.has(dateKey)) {
        transactionsByDate.set(dateKey, []);
      }
      transactionsByDate.get(dateKey)!.push(t);
    }

    const sortedDates = Array.from(transactionsByDate.keys()).sort();

    for (const dateKey of sortedDates) {
      const dayTransactions = transactionsByDate.get(dateKey)!;

      for (const t of dayTransactions) {
        const symbol = t.symbol;

        if (!cumulativeQuantity[symbol]) {
          cumulativeQuantity[symbol] = 0;
          cumulativeCost[symbol] = 0;
        }

        if (t.type === 'BUY') {
          cumulativeQuantity[symbol] += t.quantity;
          cumulativeCost[symbol] += t.totalAmount;
        } else if (t.type === 'SELL') {
          cumulativeQuantity[symbol] -= t.quantity;
          // Reduce cost proportionally when selling
          if (cumulativeQuantity[symbol] > 0 && cumulativeCost[symbol] > 0) {
            cumulativeCost[symbol] -= (t.quantity / (cumulativeQuantity[symbol] + t.quantity)) * cumulativeCost[symbol];
          } else {
            cumulativeCost[symbol] = 0;
          }
          cumulativeQuantity[symbol] = Math.max(0, cumulativeQuantity[symbol]);
        } else if (t.type === 'DIVIDEND_CASH') {
          // Cash dividend: reduces cost basis (tax-free portion) or just records as income
          cumulativeCost[symbol] = Math.max(0, cumulativeCost[symbol] - t.totalAmount * 0.5);
        } else if (t.type === 'DIVIDEND_STOCK') {
          cumulativeQuantity[symbol] += t.quantity;
          cumulativeCost[symbol] += t.totalAmount;
        } else if (t.type === 'DEPOSIT') {
          cumulativeCashFlow += t.totalAmount;
        } else if (t.type === 'WITHDRAW') {
          cumulativeCashFlow -= t.totalAmount;
        }
        // SPLIT/MERGE adjust quantity and cost proportionally, no net value change
        // The prisma schema stores ratio for splits/merges but the main portfolio route doesn't handle it
      }

      // Calculate total portfolio value at this date
      const holdingSymbols = Object.keys(cumulativeQuantity).filter(
        (s) => cumulativeQuantity[s] > 0
      );

      const cryptoSymbols = holdingSymbols.filter((s) => s.includes('/'));
      const stockSymbols = holdingSymbols.filter((s) => !s.includes('/'));

      let currentPrices: Record<string, any> = {};

      if (stockSymbols.length > 0) {
        const stockQuotes = await getStockQuotes(stockSymbols);
        currentPrices = { ...currentPrices, ...Object.fromEntries(stockQuotes) };
      }
      if (cryptoSymbols.length > 0) {
        const cryptoQuotes = await getCryptoQuotes(cryptoSymbols);
        currentPrices = { ...currentPrices, ...Object.fromEntries(cryptoQuotes) };
      }

      // Fetch exchange rates
      const twdSymbols = holdingSymbols.filter(
        (s) => {
          const t = dayTransactions.find((tx) => tx.symbol === s && tx.currency === 'TWD');
          return !!t;
        }
      );
      let twdRate = 1 / 32; // Fallback ~32 TWD per USD
      if (twdSymbols.length > 0) {
        const rates = await getExchangeRates(['TWDUSD=X']);
        twdRate = rates.get('TWDUSD=X') || twdRate;
      }

      // Calculate total value and cost at this point
      let totalValueUSD = 0;
      let totalCostUSD = 0;

      for (const symbol of holdingSymbols) {
        const qty = cumulativeQuantity[symbol];
        if (qty <= 0) continue;

        const current = currentPrices[symbol];
        const price = current?.price || 0;
        const value = qty * price;

        // Convert to USD
        const t = dayTransactions.find((tx) => tx.symbol === symbol);
        let valueUSD = value;
        let costUSD = (cumulativeCost[symbol] || 0);

        if (t) {
          if (t.currency === 'TWD') {
            valueUSD = value * twdRate;
            costUSD = costUSD * twdRate;
          } else if (t.currency === 'JPY') {
            // Fetch JPY rate
            const jpyRates = await getExchangeRates(['JPYUSD=X']);
            const jpyRate = jpyRates.get('JPYUSD=X') || 0.0067;
            valueUSD = value * jpyRate;
            costUSD = costUSD * jpyRate;
          } else if (t.currency !== 'USD' && t.currency !== 'USDT') {
            // Fallback: treat as USD
          }
        }

        totalValueUSD += valueUSD;
        totalCostUSD += costUSD;
      }

      // Add cash flow (deposits - withdrawals) in USD
      totalValueUSD += cumulativeCashFlow;
      totalCostUSD += cumulativeCashFlow;

      trendPoints.push({
        date: dateKey,
        totalValue: totalValueUSD,
        totalCost: totalCostUSD,
        unrealizedGainLoss: totalValueUSD - totalCostUSD,
        transactionCount: dayTransactions.length,
      });
    }

    // Deduplicate by date (keep latest value per day)
    const deduplicated = new Map<string, typeof trendPoints[0]>();
    for (const point of trendPoints) {
      deduplicated.set(point.date, point);
    }

    const finalData = Array.from(deduplicated.entries())
      .map(([date, point]) => ({ ...point, date }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const lastPoint = finalData[finalData.length - 1];
    const totalValue = lastPoint?.totalValue || 0;
    const totalCost = lastPoint?.totalCost || 0;
    const unrealizedGainLoss = totalValue - totalCost;

    return NextResponse.json({
      data: finalData,
      totalValue,
      totalCost,
      unrealizedGainLoss,
    });
  } catch (error) {
    console.error('Portfolio Trend API Error:', error);
    return NextResponse.json({ error: 'Failed to calculate portfolio trend' }, { status: 500 });
  }
}