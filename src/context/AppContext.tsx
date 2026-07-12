'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Locale } from '@/lib/translations';
import { getTranslation } from '@/lib/translations';

// ============================================
// Types
// ============================================
export type Currency = 'MAD' | 'EUR' | 'USD';
export type Timezone = 'Africa/Casablanca' | 'Europe/Paris' | 'America/New_York' | 'Asia/Dubai';

interface LocaleSettings {
  language: Locale;
  currency: Currency;
  timezone: Timezone;
  conversionRates: Record<Currency, number>; // rate relative to MAD
}

interface AppContextType {
  // Locale
  locale: LocaleSettings;
  setLanguage: (lang: Locale) => void;
  setCurrency: (cur: Currency) => void;
  setTimezone: (tz: Timezone) => void;
  setConversionRate: (cur: Currency, rate: number) => void;

  // Helpers
  t: (key: string) => string;
  formatCurrency: (amountMAD: number) => string;
  formatDate: (dateStr: string) => string;
}

// ============================================
// Default values
// ============================================
const defaultLocale: LocaleSettings = {
  language: 'fr',
  currency: 'MAD',
  timezone: 'Africa/Casablanca',
  conversionRates: {
    MAD: 1,
    EUR: 0.092,
    USD: 0.099,
  },
};

// ============================================
// Context
// ============================================
const AppContext = createContext<AppContextType>({
  locale: defaultLocale,
  setLanguage: () => {},
  setCurrency: () => {},
  setTimezone: () => {},
  setConversionRate: () => {},
  t: (key: string) => key,
  formatCurrency: (amount: number) => `${amount} MAD`,
  formatDate: (dateStr: string) => dateStr,
});

export function useApp() {
  return useContext(AppContext);
}

// ============================================
// Provider
// ============================================
function getInitialLocale(): LocaleSettings {
  try {
    const savedLang = sessionStorage.getItem('smartmaint-locale');
    if (savedLang && (savedLang === 'fr' || savedLang === 'en' || savedLang === 'ar')) {
      return { ...defaultLocale, language: savedLang as Locale };
    }
  } catch { /* ignore */ }
  return defaultLocale;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<LocaleSettings>(getInitialLocale);

  // Re-sync from sessionStorage whenever it changes in this tab
  useEffect(() => {
    const handler = () => {
      try {
        const savedLang = sessionStorage.getItem('smartmaint-locale');
        if (savedLang && (savedLang === 'fr' || savedLang === 'en' || savedLang === 'ar')) {
          setLocale(prev => ({ ...prev, language: savedLang as Locale }));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('smartmaint-locale-change', handler);
    return () => window.removeEventListener('smartmaint-locale-change', handler);
  }, []);

  const setLanguage = useCallback((lang: Locale) => {
    setLocale(prev => ({ ...prev, language: lang }));
    try { sessionStorage.setItem('smartmaint-locale', lang); } catch { /* ignore */ }
  }, []);

  const setCurrency = useCallback((cur: Currency) => {
    setLocale(prev => ({ ...prev, currency: cur }));
  }, []);

  const setTimezone = useCallback((tz: Timezone) => {
    setLocale(prev => ({ ...prev, timezone: tz }));
  }, []);

  const setConversionRate = useCallback((cur: Currency, rate: number) => {
    setLocale(prev => ({
      ...prev,
      conversionRates: { ...prev.conversionRates, [cur]: rate },
    }));
  }, []);

  // Translation helper
  const t = useCallback((key: string): string => {
    return getTranslation(locale.language, key);
  }, [locale.language]);

  // Currency formatting
  const formatCurrency = useCallback((amountMAD: number): string => {
    const rate = locale.conversionRates[locale.currency];
    const converted = amountMAD * rate;
    const symbols: Record<Currency, string> = { MAD: 'MAD', EUR: '€', USD: '$' };
    const localeStr = locale.language === 'ar' ? 'ar-MA' : locale.language === 'en' ? 'en-US' : 'fr-FR';

    if (locale.currency === 'MAD') {
      return `${converted.toLocaleString(localeStr, { maximumFractionDigits: 0 })} MAD`;
    }
    return `${symbols[locale.currency]}${converted.toLocaleString(localeStr, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [locale.currency, locale.conversionRates, locale.language]);

  // Date formatting
  const formatDate = useCallback((dateStr: string): string => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      const localeStr = locale.language === 'ar' ? 'ar-MA' : locale.language === 'en' ? 'en-US' : 'fr-FR';
      return date.toLocaleDateString(localeStr, {
        year: 'numeric', month: 'short', day: 'numeric',
        timeZone: locale.timezone,
      });
    } catch {
      return dateStr;
    }
  }, [locale.language, locale.timezone]);

  return (
    <AppContext.Provider value={{
      locale, setLanguage, setCurrency, setTimezone, setConversionRate,
      t, formatCurrency, formatDate,
    }}>
      {children}
    </AppContext.Provider>
  );
}
