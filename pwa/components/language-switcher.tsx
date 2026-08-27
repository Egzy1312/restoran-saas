'use client';

import { useState } from 'react';
import { SUPPORTED_LOCALES } from '@/lib/locale';
import { cn } from '@/lib/utils';

export default function LanguageSwitcher({ locale, onChange }: { locale: string; onChange: (locale: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-sm shadow-sm"
        aria-label="Promijeni jezik"
      >
        <span>{current.flag}</span>
        <span className="text-xs text-muted-foreground">{current.code.toUpperCase()}</span>
      </button>

      {open && (
        <>
          {/* Nevidljivi overlay da klik van menija zatvori dropdown */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 overflow-hidden rounded-lg border bg-card shadow-lg">
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  onChange(l.code);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm hover:bg-accent',
                  l.code === locale ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                <span>{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
