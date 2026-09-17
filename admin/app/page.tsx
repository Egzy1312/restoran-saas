import type { Metadata } from 'next';
import LandingPage from '@/components/landing-page';
import AuthRedirect from '@/components/auth-redirect';

export const metadata: Metadata = {
  title: 'Restaurant.ba — Sve-u-jednom platforma za restorane',
  description: 'QR meni, narudžbe uživo u kuhinji, tlocrt stolova, rezervacije i analitika. 14 dana besplatno, bez kartice.',
};

export default function HomePage() {
  return (
    <>
      <AuthRedirect />
      <LandingPage />
    </>
  );
}
