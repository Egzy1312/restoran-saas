'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { getStaffUser, getToken, updateCachedUser } from '@/lib/auth';
import { disableTwoFactor, enableTwoFactor, setupTwoFactor } from '@/lib/api';
import AppShell from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default function AccountPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  // Podesavanje (korak 1) - QR kod se prikazuje dok korisnik ne potvrdi prvi kod.
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = getToken();
    const user = getStaffUser();
    if (!t || !user) {
      router.replace('/login');
      return;
    }
    setToken(t);
    setEnabled(user.totp_enabled);
  }, [router]);

  async function onStartSetup() {
    if (!token) return;
    setLoading(true);
    try {
      const { secret, otpauth_url } = await setupTwoFactor(token);
      const qrDataUrl = await QRCode.toDataURL(otpauth_url, { width: 220, margin: 1 });
      setSetup({ secret, qrDataUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška pri pokretanju podešavanja.');
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmSetup(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      await enableTwoFactor(token, confirmCode);
      setEnabled(true);
      updateCachedUser({ totp_enabled: true });
      setSetup(null);
      setConfirmCode('');
      toast.success('2FA je uspješno uključen.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Neispravan kod.');
    } finally {
      setLoading(false);
    }
  }

  async function onDisable(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      await disableTwoFactor(token, disablePassword);
      setEnabled(false);
      updateCachedUser({ totp_enabled: false });
      setDisablePassword('');
      toast.success('2FA je isključen.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pogrešna lozinka.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) return null;

  return (
    <AppShell>
      <div className="flex max-w-lg flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nalog i sigurnost</h1>
          <p className="text-muted-foreground">Upravljajte dvofaktorskom autentikacijom svog naloga.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
              </div>
              <div>
                <CardTitle>Dvofaktorska autentikacija (2FA)</CardTitle>
                <CardDescription>Kod iz authenticator aplikacije uz email i lozinku.</CardDescription>
              </div>
              {enabled && !setup && (
                <Badge variant="success" className="ml-auto">
                  Uključen
                </Badge>
              )}
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="flex flex-col gap-4 pt-5">
            {!setup && !enabled && (
              <>
                <p className="text-sm text-muted-foreground">
                  Dodatan sloj zaštite - pri prijavi ćete morati unijeti i kod iz authenticator aplikacije (npr. Google
                  Authenticator, Authy), ne samo lozinku.
                </p>
                <Button onClick={onStartSetup} disabled={loading} className="w-fit">
                  {loading ? 'Pokretanje…' : 'Uključi 2FA'}
                </Button>
              </>
            )}

            {setup && (
              <form onSubmit={onConfirmSetup} className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Skenirajte ovaj QR kod u svojoj authenticator aplikaciji:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qrDataUrl} alt="2FA QR kod" className="mx-auto h-56 w-56 rounded-lg border p-2" />
                <p className="break-all text-center text-xs text-muted-foreground">Ručni unos: {setup.secret}</p>
                <Input
                  inputMode="numeric"
                  required
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  className="text-center text-lg tracking-widest"
                />
                <Button type="submit" disabled={loading}>
                  {loading ? 'Potvrđivanje…' : 'Potvrdi i uključi'}
                </Button>
              </form>
            )}

            {enabled && !setup && (
              <form onSubmit={onDisable} className="flex flex-col gap-3">
                <Label htmlFor="disable-password">Lozinka (potrebna da isključite 2FA)</Label>
                <Input
                  id="disable-password"
                  type="password"
                  required
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
                <Button type="submit" variant="destructive" disabled={loading} className="w-fit">
                  {loading ? 'Isključivanje…' : 'Isključi 2FA'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
