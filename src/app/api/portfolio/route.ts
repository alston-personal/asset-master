import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStockQuotes, getCryptoQuotes } from '@/lib/finance';
import { convertCurrency, getRateFromUSD } from '@/lib/currency';
import { BaseCurrency } from '@/types/ledger';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetBaseCurrency = (searchParams.get('baseCurrency') || 'USD') as BaseCurrency;

    const transactions = await prisma.transaction.findMany();

    // Group transactions by symbol
    const portfolio: Record<string, any> = {};

    transactions.forEach((t) => {
      if (!portfolio[t.symbol]) {
        portfolio[t.symbol] = {
          symbol: t.symbol,
          assetType: t.assetType,
          totalQuantity: 0,
          totalCost: 0,
          currency: t.currency,
        };
      }

      const p = portfolio[t.symbol];

      if (t.type === 'BUY' || t.type === 'DIVIDEND_STOCK' || t.type === 'DEPOSIT') {
        p.totalQuantity += t.quantity;
        // Simplified cost basis calculation (Weighted Average)
        if (t.type === 'BUY') {
          p.totalCost += t.totalAmount;
        }
      } else if (t.type === 'SELL' || t.type === 'WITHDRAW') {
        p.totalQuantity -= t.quantity;
        // Selling doesn't change average cost basis, but decreases total cost proportional to quantity
        // This is a simplified FIFO/WAC approach
      }
    });

    // Remove assets with 0 quantity
    const activeSymbols = Object.keys(portfolio).filter(s => portfolio[s].totalQuantity > 0);

    // Fetch current prices
    const cryptoSymbols = activeSymbols.filter(s => s.includes('/'));
    const stockSymbols = activeSymbols.filter(s => !s.includes('/'));

    let currentPrices: Record<string, any> = {};

    if (stockSymbols.length > 0) {
      const stockQuotes = await getStockQuotes(stockSymbols);
      currentPrices = { ...currentPrices, ...Object.fromEntries(stockQuotes) };
    }
    if (cryptoSymbols.length > 0) {
      const cryptoQuotes = await getCryptoQuotes(cryptoSymbols);
      currentPrices = { ...currentPrices, ...Object.fromEntries(cryptoQuotes) };
    }

    // Final calculation with currency conversion
    const results = await Promise.all(
      activeSymbols.map(async (symbol) => {
        const p = portfolio[symbol];
        const current = currentPrices[symbol];
        const price = current?.price || 0;
        const value = p.totalQuantity * price;
        const itemCurrency = p.currency || (symbol.endsWith('.TW') ? 'TWD' : symbol.endsWith('.T') ? 'JPY' : symbol.includes('/') ? 'USDT' : 'USD');

        // Convert to USD first
        const usdConversion = await convertCurrency(value, itemCurrency, 'USD');
        const costUsdConversion = await convertCurrency(p.totalCost, itemCurrency, 'USD');

        // Convert to requested base currency
        const baseConversion = await convertCurrency(value, itemCurrency, targetBaseCurrency);
        const costBaseConversion = await convertCurrency(p.totalCost, itemCurrency, targetBaseCurrency);

        const avgCost = p.totalQuantity > 0 ? (p.totalCost / p.totalQuantity) : 0;
        const gainLoss = value - p.totalCost;
        const gainLossPercent = p.totalCost > 0 ? (gainLoss / p.totalCost) * 100 : 0;
        const unrealizedGainLossBase = baseConversion.convertedAmount - costBaseConversion.convertedAmount;

        return {
          ...p,
          currency: itemCurrency,
          currentPrice: price,
          currentValue: value,
          currentValueUSD: usdConversion.convertedAmount,
          currentValueBase: baseConversion.convertedAmount,
          baseCurrency: targetBaseCurrency,
          exchangeRateToBase: baseConversion.exchangeRate,
          averageCost: avgCost,
          unrealizedGainLoss: gainLoss,
          unrealizedGainLossBase: unrealizedGainLossBase,
          unrealizedGainLossPercentage: gainLossPercent,
        };
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error('Portfolio API Error:', error);
    return NextResponse.json({ error: 'Failed to calculate portfolio' }, { status: 500 });
  }
}
