import { NextResponse } from 'next/server';
import { convertCurrency, getRateFromUSD } from '@/lib/currency';
import { BaseCurrency } from '@/types/ledger';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || 'USD';
    const to = (searchParams.get('to') || 'TWD') as BaseCurrency;
    const amountStr = searchParams.get('amount') || '1';
    const amount = parseFloat(amountStr);

    if (isNaN(amount)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const result = await convertCurrency(amount, from, to);

    // Also return rates for common base currencies if requested
    const twdRate = await getRateFromUSD('TWD');
    const jpyRate = await getRateFromUSD('JPY');

    return NextResponse.json({
      ...result,
      rates: {
        USD: 1.0,
        TWD: twdRate.rate,
        JPY: jpyRate.rate,
      },
    });
  } catch (error: any) {
    console.error('Currency API Error:', error);
    return NextResponse.json({ error: 'Failed to convert currency', details: error.message }, { status: 500 });
  }
}
