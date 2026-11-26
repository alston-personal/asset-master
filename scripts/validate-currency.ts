import { convertCurrency, convertBatchToBaseCurrency } from '../src/lib/currency';

async function runValidation() {
  console.log('--- Multi-Currency Calculation Validation ---');

  // Test 1: Identity conversion
  const idResult = await convertCurrency(100, 'USD', 'USD');
  console.log(`[Test 1] 100 USD -> USD: ${idResult.convertedAmount} (Rate: ${idResult.exchangeRate})`);
  if (idResult.convertedAmount !== 100) throw new Error('Identity conversion failed');

  // Test 2: Live or Fallback conversion USD to TWD
  const twdResult = await convertCurrency(100, 'USD', 'TWD');
  console.log(`[Test 2] 100 USD -> TWD: ${twdResult.convertedAmount} (Rate: ${twdResult.exchangeRate}, Fallback: ${twdResult.fallback})`);
  if (twdResult.convertedAmount <= 0) throw new Error('USD to TWD conversion failed');

  // Test 3: Batch calculation
  const batch = [
    { amount: 100, currency: 'USD' },
    { amount: 3000, currency: 'TWD' }
  ];
  const batchResults = await convertBatchToBaseCurrency(batch, 'USD');
  const totalUSD = batchResults.reduce((acc, curr) => acc + curr.convertedAmount, 0);
  console.log(`[Test 3] Portfolio Total in USD: $${totalUSD.toFixed(2)}`);

  console.log('--- All Manual Validations Passed Successfully! ---');
}

runValidation().catch((err) => {
  console.error('Validation Error:', err);
  process.exit(1);
});
