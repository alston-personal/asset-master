import { getExchangeRates } from './finance';
import { BaseCurrency, CurrencyConversionResult } from '@/types/ledger';

/**
 * 快取匯率資料與過期機制 (預設 TTL: 5 分鐘)
 */
interface RateCacheEntry {
  rate: number;
  fetchedAt: number;
}

const rateCache = new Map<string, RateCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function clearRateCache(): void {
  rateCache.clear();
}

// 常用降級匯率 (Fallback rates，以 1 USD 為基準)
const FALLBACK_RATES_USD_BASED: Record<string, number> = {
  USD: 1.0,
  USDT: 1.0,
  TWD: 32.0,
  JPY: 155.0,
  BTC: 0.000015,
  ETH: 0.00035,
};

/**
 * 取得匯率對 (例如 'USDTWD=X', 'USDJPY=X') 的即時匯率
 */
export async function getCachedExchangeRate(pair: string): Promise<number | null> {
  const cached = rateCache.get(pair);
  const now = Date.now();

  if (cached && (now - cached.fetchedAt < CACHE_TTL_MS)) {
    return cached.rate;
  }

  try {
    const fetchedMap = await getExchangeRates([pair]);
    const rate = fetchedMap.get(pair);
    if (rate !== undefined && rate > 0) {
      rateCache.set(pair, { rate, fetchedAt: now });
      return rate;
    }
  } catch (err) {
    console.warn(`Failed to fetch live exchange rate for ${pair}:`, err);
  }

  if (cached) {
    return cached.rate;
  }

  return null;
}

/**
 * 取得指定貨幣對 USD 的匯率 (1 FromCurrency = ? USD)
 */
export async function getRateToUSD(currency: string): Promise<{ rate: number; fallback: boolean }> {
  const curr = currency.toUpperCase();
  if (curr === 'USD' || curr === 'USDT') {
    return { rate: 1.0, fallback: false };
  }

  // TWD -> USD
  if (curr === 'TWD') {
    const pairRate = await getCachedExchangeRate('TWDUSD=X');
    if (pairRate) return { rate: pairRate, fallback: false };
    const usdTwd = await getCachedExchangeRate('USDTWD=X');
    if (usdTwd) return { rate: 1 / usdTwd, fallback: false };
    return { rate: 1 / FALLBACK_RATES_USD_BASED.TWD, fallback: true };
  }

  // JPY -> USD
  if (curr === 'JPY') {
    const pairRate = await getCachedExchangeRate('JPYUSD=X');
    if (pairRate) return { rate: pairRate, fallback: false };
    const usdJpy = await getCachedExchangeRate('USDJPY=X');
    if (usdJpy) return { rate: 1 / usdJpy, fallback: false };
    return { rate: 1 / FALLBACK_RATES_USD_BASED.JPY, fallback: true };
  }

  return { rate: 1.0, fallback: true };
}

/**
 * 取得從 USD 轉為目標貨幣的匯率 (1 USD = ? TargetCurrency)
 */
export async function getRateFromUSD(toCurrency: BaseCurrency | string): Promise<{ rate: number; fallback: boolean }> {
  const target = toCurrency.toUpperCase();
  if (target === 'USD' || target === 'USDT') {
    return { rate: 1.0, fallback: false };
  }

  if (target === 'TWD') {
    const usdTwd = await getCachedExchangeRate('USDTWD=X');
    if (usdTwd) return { rate: usdTwd, fallback: false };
    const twdUsd = await getCachedExchangeRate('TWDUSD=X');
    if (twdUsd) return { rate: 1 / twdUsd, fallback: false };
    return { rate: FALLBACK_RATES_USD_BASED.TWD, fallback: true };
  }

  if (target === 'JPY') {
    const usdJpy = await getCachedExchangeRate('USDJPY=X');
    if (usdJpy) return { rate: usdJpy, fallback: false };
    const jpyUsd = await getCachedExchangeRate('JPYUSD=X');
    if (jpyUsd) return { rate: 1 / jpyUsd, fallback: false };
    return { rate: FALLBACK_RATES_USD_BASED.JPY, fallback: true };
  }

  return { rate: 1.0, fallback: true };
}

/**
 * 將指定金額從來源貨幣轉換為目標貨幣
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: BaseCurrency | string
): Promise<CurrencyConversionResult> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) {
    return {
      originalAmount: amount,
      convertedAmount: amount,
      fromCurrency: from,
      toCurrency: to,
      exchangeRate: 1.0,
      fallback: false,
    };
  }

  // Direct pair check (e.g. USDTWD=X, JPYTWD=X)
  const directPair = `${from}${to}=X`;
  const directRate = await getCachedExchangeRate(directPair);
  if (directRate) {
    return {
      originalAmount: amount,
      convertedAmount: amount * directRate,
      fromCurrency: from,
      toCurrency: to,
      exchangeRate: directRate,
      fallback: false,
    };
  }

  // Inverse pair check (e.g. TWDUSD=X -> USDTWD)
  const inversePair = `${to}${from}=X`;
  const inverseRate = await getCachedExchangeRate(inversePair);
  if (inverseRate && inverseRate > 0) {
    const rate = 1 / inverseRate;
    return {
      originalAmount: amount,
      convertedAmount: amount * rate,
      fromCurrency: from,
      toCurrency: to,
      exchangeRate: rate,
      fallback: false,
    };
  }

  // Cross conversion via USD
  const { rate: toUsdRate, fallback: fb1 } = await getRateToUSD(from);
  const { rate: fromUsdRate, fallback: fb2 } = await getRateFromUSD(to);
  const combinedRate = toUsdRate * fromUsdRate;

  return {
    originalAmount: amount,
    convertedAmount: amount * combinedRate,
    fromCurrency: from,
    toCurrency: to,
    exchangeRate: combinedRate,
    fallback: fb1 || fb2,
  };
}

/**
 * 批量轉換多筆不同幣別金額至統一基準貨幣
 */
export async function convertBatchToBaseCurrency(
  items: Array<{ amount: number; currency: string }>,
  baseCurrency: BaseCurrency
): Promise<Array<CurrencyConversionResult>> {
  return Promise.all(
    items.map(item => convertCurrency(item.amount, item.currency, baseCurrency))
  );
}
