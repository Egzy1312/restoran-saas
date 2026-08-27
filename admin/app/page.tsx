import LandingPage from '@/components/landing-page';
import AuthRedirect from '@/components/auth-redirect';

export default function HomePage() {
  return (
    <>
      <AuthRedirect />
      <LandingPage />
    </>
  );
}
