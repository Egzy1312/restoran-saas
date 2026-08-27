'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffUser, getToken } from '@/lib/auth';

/**
 * Nevidljiva komponenta - preusmjerava VEC prijavljene korisnike sa landing
 * stranice na njihov dashboard/platform. Odvojeno od LandingPage-a (koji je
 * sad plain server component bez 'use client') da marketinski sadrzaj bude
 * odmah u pocetnom HTML-u (SEO, brzo prvo iscrtavanje) umjesto da čeka
 * hidrataciju - logika za "vec prijavljen" je sporedan slucaj, ne glavni.
 */
export default function AuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const user = getStaffUser();
    router.replace(user?.role === 'SUPER_ADMIN' ? '/platform' : '/dashboard');
  }, [router]);

  return null;
}
