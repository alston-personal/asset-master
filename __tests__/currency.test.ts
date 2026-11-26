import { convertCurrency, convertBatchToBaseCurrency, clearRateCache } from '@/lib/currency';
import * as finance from '@/lib/finance';

jest.mock('@/lib/finance', () => ({
  getExchangeRates: jest.fn(),
}));

describe('Multi-currency Asset Calculation Tests', () => {
  const mockedGetExchangeRates = finance.getExchangeRates as jest.MockedFunction<typeof finance.getExchangeRates>;

  beforeEach(() => {
    jest.clearAllMocks();
    clearRateCache();
  });

  describe('Same Currency Conversion', () => {
    it('returns exact amount with exchangeRate 1.0 when from and to currencies match', async () => {
      const result = await convertCurrency(1000, 'USD', 'USD');
      expect(result).toEqual({
        originalAmount: 1000,
        convertedAmount: 1000,
        fromCurrency: 'USD',
        toCurrency: 'USD',
        exchangeRate: 1.0,
        fallback: false,
      });
    });

    it('handles case-insensitivity correctly (twd -> TWD)', async () => {
      const result = await convertCurrency(500, 'twd', 'TWD');
      expect(result.convertedAmount).toBe(500);
      expect(result.exchangeRate).toBe(1.0);
    });
  });

  describe('Direct Pair Conversion', () => {
    it('uses direct pair rate when available (USDTWD=X)', async () => {
      mockedGetExchangeRates.mockImplementation(async (pairs: string[]) => {
        const map = new Map<string, number>();
        if (pairs.includes('USDTWD=X')) map.set('USDTWD=X', 32.5);
        return map;
      });

      const result = await convertCurrency(100, 'USD', 'TWD');
      expect(result.exchangeRate).toBe(32.5);
      expect(result.convertedAmount).toBe(3250);
      expect(result.fallback).toBe(false);
      expect(mockedGetExchangeRates).toHaveBeenCalledWith(['USDTWD=X']);
    });
  });

  describe('Inverse Pair Conversion', () => {
    it('calculates reciprocal rate when inverse pair is available', async () => {
      mockedGetExchangeRates.mockImplementation(async (pairs: string[]) => {
        const map = new Map<string, number>();
        // TWDUSD=X not available, but USDTWD=X is available
        if (pairs.includes('USDTWD=X')) map.set('USDTWD=X', 32.0);
        return map;
      });

      const result = await convertCurrency(3200, 'TWD', 'USD');
      expect(result.exchangeRate).toBe(1 / 32.0);
      expect(result.convertedAmount).toBeCloseTo(100, 4);
      expect(result.fallback).toBe(false);
    });
  });

  describe('Cross-Currency Conversion via USD', () => {
    it('accurately converts JPY to TWD via USD', async () => {
      mockedGetExchangeRates.mockImplementation(async (pairs: string[]) => {
        const map = new Map<string, number>();
        if (pairs.includes('USDJPY=X')) map.set('USDJPY=X', 150.0);
        if (pairs.includes('USDTWD=X')) map.set('USDTWD=X', 30.0);
        return map;
      });

      const result = await convertCurrency(15000, 'JPY', 'TWD');
      // 15000 JPY / 150 = 100 USD, 100 USD * 30 = 3000 TWD
      expect(result.convertedAmount).toBeCloseTo(3000, 2);
      expect(result.exchangeRate).toBeCloseTo(30.0 / 150.0, 4);
      expect(result.fallback).toBe(false);
    });
  });

  describe('Fallback Mechanism', () => {
    it('uses fallback rate when network/API fails completely', async () => {
      mockedGetExchangeRates.mockImplementation(async () => {
        return new Map<string, number>();
      });

      // TWD fallback rate is 32.0 (1 USD = 32 TWD, 1 TWD = 1/32 USD)
      const result = await convertCurrency(320, 'TWD', 'USD');
      expect(result.fallback).toBe(true);
      expect(result.convertedAmount).toBeCloseTo(10, 2);
    });
  });

  describe('Batch Conversion', () => {
    it('converts mixed currency portfolio items to base currency', async () => {
      mockedGetExchangeRates.mockImplementation(async (pairs: string[]) => {
        const map = new Map<string, number>();
        if (pairs.includes('USDTWD=X')) map.set('USDTWD=X', 32.0);
        return map;
      });

      const items = [
        { amount: 100, currency: 'USD' },
        { amount: 3200, currency: 'TWD' },
      ];

      const results = await convertBatchToBaseCurrency(items, 'TWD');
      expect(results[0].convertedAmount).toBe(3200); // 100 USD = 3200 TWD
      expect(results[1].convertedAmount).toBe(3200); // 3200 TWD = 3200 TWD

      const totalBaseValue = results.reduce((sum, r) => sum + r.convertedAmount, 0);
      expect(totalBaseValue).toBe(6400);
    });
  });

  describe('Edge Cases & Precision', () => {
    it('handles 0 amount accurately', async () => {
      const result = await convertCurrency(0, 'USD', 'TWD');
      expect(result.convertedAmount).toBe(0);
    });

    it('handles crypto conversions (USDT = USD 1:1)', async () => {
      const result = await convertCurrency(50, 'USDT', 'USD');
      expect(result.convertedAmount).toBe(50);
      expect(result.exchangeRate).toBe(1.0);
    });
  });
});
