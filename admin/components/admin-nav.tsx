'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getStaffUser } from '@/lib/auth';
import { resendVerification } from '@/lib/api';

const LINKS = [
  { href: '/menu', label: 'Meni' },
  { href: '/tables', label: 'Stolovi' },
  { href: '/reservations', label: 'Rezervacije' },
  { href: '/analytics', label: 'Analitika' },
  { href: '/staff', label: 'Osoblje' },
  { href: '/settings', label: 'Postavke' },
  { href: '/billing', label: 'Naplata' },
  { href: '/account', label: 'Nalog' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStaffUser();
  const [resent, setResent] = useState(false);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  async function onResendVerification() {
    if (!user) return;
    await resendVerification(user.email).catch(() => undefined);
    setResent(true);
  }

  // SUPER_ADMIN nikad ne treba vidjeti ovaj nav (koristi /platform, koje ima
  // svoj sopstveni jednostavan header) - ovo je samo zastita ako se
  // komponenta greskom nekad renderuje na toj ruti.
  if (user?.role === 'SUPER_ADMIN') return null;

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 bg-card border-b border-stone-200">
        <div className="flex items-center gap-4">
          <span className="font-bold text-orange-600">Admin</span>
          <nav className="flex gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  pathname?.startsWith(link.href) ? 'bg-orange-600 text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-500 hidden sm:inline">{user?.full_name}</span>
          <button onClick={logout} className="text-sm rounded-lg border border-stone-300 px-3 py-1.5">
            Odjava
          </button>
        </div>
      </header>

      {/* Ne blokira koristenje panela - samo podsjetnik (vidi AuthService.register/verifyEmail). */}
      {user && !user.email_verified && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
          <span>Molimo potvrdite svoj email ({user.email}) - poslali smo vam link.</span>
          {resent ? (
            <span className="text-amber-600">Poslato!</span>
          ) : (
            <button onClick={onResendVerification} className="underline font-medium">
              Pošalji ponovo
            </button>
          )}
        </div>
      )}
    </>
  );
}
