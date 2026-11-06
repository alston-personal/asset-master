'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { BaseCurrency } from '@/types/ledger';

type ColorScheme = 'TW' | 'US';

interface SettingsContextType {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  baseCurrency: BaseCurrency;
  setBaseCurrency: (currency: BaseCurrency) => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>('US');
  const [baseCurrency, setBaseCurrencyState] = useState<BaseCurrency>('USD');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.colorScheme) {
            setColorSchemeState(data.colorScheme as ColorScheme);
          }
          if (data.baseCurrency) {
            setBaseCurrencyState(data.baseCurrency as BaseCurrency);
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const setColorScheme = async (scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'colorScheme', value: scheme }),
      });
    } catch (error) {
      console.error('Failed to save setting', error);
    }
  };

  const setBaseCurrency = async (currency: BaseCurrency) => {
    setBaseCurrencyState(currency);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'baseCurrency', value: currency }),
      });
    } catch (error) {
      console.error('Failed to save base currency setting', error);
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        colorScheme,
        setColorScheme,
        baseCurrency,
        setBaseCurrency,
        isLoading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
