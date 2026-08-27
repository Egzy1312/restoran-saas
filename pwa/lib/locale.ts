'use client';

import { useEffect, useState } from 'react';

/**
 * Multi-language podrška (specifikacija, modul A.3): "Automatska detekcija
 * jezika pretraživača (Bosanski/Hrvatski/Srpski, Engleski, Njemački,
 * Italijanski) s mogućnošću ručne promjene."
 *
 * Podaci u bazi (`name_json`) trenutno realno popunjavaju samo `bs`/`en`
 * ključeve (vidi seed skriptu) - de/it su ipak ponuđeni u prekidaču jer ih
 * spec eksplicitno traži, sa gracioznim fallback-om na bs/en kad prevod ne
 * postoji (isti fallback lanac kao ranije, samo sad prvo proba izabrani jezik).
 */
export interface LocaleOption {
  code: string;
  label: string;
  flag: string;
}

export const SUPPORTED_LOCALES: LocaleOption[] = [
  { code: 'bs', label: 'Bosanski', flag: '🇧🇦' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
];

const STORAGE_KEY = 'restoran_locale';

/** bs/hr/sr dijele isti `name_json` kljuc ('bs') - nemamo odvojene prevode za sve tri, pa se sve mapiraju na 'bs'. */
function normalizeBrowserLanguage(lang: string): string {
  const base = lang.toLowerCase().split('-')[0];
  if (['bs', 'hr', 'sr'].includes(base)) return 'bs';
  if (SUPPORTED_LOCALES.some((l) => l.code === base)) return base;
  return 'bs';
}

function detectBrowserLocale(): string {
  if (typeof navigator === 'undefined') return 'bs';
  for (const lang of navigator.languages ?? [navigator.language]) {
    const normalized = normalizeBrowserLanguage(lang);
    if (normalized) return normalized;
  }
  return 'bs';
}

/** Hook koji cuva izbor u localStorage (prezivljava navigaciju izmedju /r, /takeaway, /book stranica) - ako gost jos nije birao, koristi jezik browsera. */
export function useLocale(): [string, (locale: string) => void] {
  const [locale, setLocaleState] = useState('bs');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    setLocaleState(stored ?? detectBrowserLocale());
  }, []);

  function setLocale(next: string) {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return [locale, setLocale];
}

/** Lokalizuje `name_json`/`description_json` polje - prvo izabrani jezik, pa isti fallback lanac kao ranije (bs -> en -> bilo koji dostupan). */
export function localize(json: Record<string, string | undefined> | null | undefined, locale: string): string {
  if (!json) return '';
  return json[locale] ?? json.bs ?? json.en ?? Object.values(json).find(Boolean) ?? '';
}
