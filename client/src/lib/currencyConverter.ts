// Currency conversion utility for fetching latest exchange rates
// and converting between currencies

// Cache for storing exchange rates to avoid multiple API calls
type ExchangeRateCache = {
  rates: Record<string, number>;
  lastUpdated: number;
  base: string;
};

// Default cache expiration time in milliseconds (30 minutes)
const CACHE_EXPIRATION = 30 * 60 * 1000;

// Store exchange rates in memory
let exchangeRateCache: ExchangeRateCache | null = null;

/**
 * Fetch the latest exchange rates from an external API
 * Uses exchangerate-api.com's free API
 */
export const fetchExchangeRates = async (base: string = 'USD'): Promise<Record<string, number>> => {
  // Check if cache exists and is still valid
  if (
    exchangeRateCache && 
    exchangeRateCache.base === base &&
    Date.now() - exchangeRateCache.lastUpdated < CACHE_EXPIRATION
  ) {
    return exchangeRateCache.rates;
  }

  try {
    // Fetch the latest rates from exchangerate-api.com
    const response = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rates');
    }
    
    const data = await response.json();
    
    // Update the cache
    exchangeRateCache = {
      rates: data.rates,
      lastUpdated: Date.now(),
      base: base
    };
    
    return data.rates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    // Return fallback rates if fetch fails
    return {
      USD: 1,
      EUR: 0.93,
      INR: 83.5,
    };
  }
};

/**
 * Convert amount from one currency to another
 */
export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> => {
  if (fromCurrency === toCurrency) {
    return amount;
  }
  
  try {
    // Fetch rates with the fromCurrency as base
    const rates = await fetchExchangeRates(fromCurrency);
    
    if (!rates[toCurrency]) {
      throw new Error(`Exchange rate for ${toCurrency} not found`);
    }
    
    // Convert the amount
    return amount * rates[toCurrency];
  } catch (error) {
    console.error('Currency conversion error:', error);
    return amount; // Return original amount if conversion fails
  }
};

/**
 * Format a currency value based on currency code
 */
export const formatCurrency = (amount: number, currencyCode: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (error) {
    console.error('Currency formatting error:', error);
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
};