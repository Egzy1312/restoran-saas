'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Store, Printer, ShieldAlert, ClipboardCheck, MessageCircle, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { fetchRestaurant, Restaurant, updateRestaurantSettings } from '@/lib/api';
import AppShell from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export default function SettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [saving, setSaving] = useState(false);

  // Kontrolisana polja - odvojeno od `restaurant` da se sekreti (Twilio/Stripe)
  // nikad ne prepisuju nazad iz API odgovora (samo "postavljeno da/ne" flagovi).
  const [form, setForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    kitchenPrinterIp: '',
    kitchenPrinterPort: '',
    barPrinterIp: '',
    barPrinterPort: '',
    geofenceRadiusMeters: '',
    allowedIp: '',
    requireOrderApproval: false,
    twilioAccountSid: '',
    twilioFromNumber: '',
    twilioAuthToken: '',
    stripeSecretKey: '',
    stripeWebhookSecret: '',
  });

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetchRestaurant(token).then((r) => {
      setRestaurant(r);
      setForm({
        name: r.name,
        address: r.address,
        latitude: r.latitude ?? '',
        longitude: r.longitude ?? '',
        kitchenPrinterIp: r.kitchenPrinterIp ?? '',
        kitchenPrinterPort: r.kitchenPrinterPort ? String(r.kitchenPrinterPort) : '',
        barPrinterIp: r.barPrinterIp ?? '',
        barPrinterPort: r.barPrinterPort ? String(r.barPrinterPort) : '',
        geofenceRadiusMeters: r.geofenceRadiusMeters ? String(r.geofenceRadiusMeters) : '',
        allowedIp: r.allowedIp ?? '',
        requireOrderApproval: r.requireOrderApproval,
        twilioAccountSid: r.twilioAccountSid ?? '',
        twilioFromNumber: r.twilioFromNumber ?? '',
        twilioAuthToken: '',
        stripeSecretKey: '',
        stripeWebhookSecret: '',
      });
    });
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateRestaurantSettings(token, {
        name: form.name || undefined,
        address: form.address || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        kitchen_printer_ip: form.kitchenPrinterIp || undefined,
        kitchen_printer_port: form.kitchenPrinterPort ? Number(form.kitchenPrinterPort) : undefined,
        bar_printer_ip: form.barPrinterIp || undefined,
        bar_printer_port: form.barPrinterPort ? Number(form.barPrinterPort) : undefined,
        geofence_radius_meters: form.geofenceRadiusMeters ? Number(form.geofenceRadiusMeters) : undefined,
        allowed_ip: form.allowedIp || undefined,
        require_order_approval: form.requireOrderApproval,
        twilio_account_sid: form.twilioAccountSid || undefined,
        twilio_from_number: form.twilioFromNumber || undefined,
        // Prazno = "ne diraj vec sacuvanu vrijednost" (vidi RestaurantsService.updateSettings)
        twilio_auth_token: form.twilioAuthToken || undefined,
        stripe_secret_key: form.stripeSecretKey || undefined,
        stripe_webhook_secret: form.stripeWebhookSecret || undefined,
      });
      setRestaurant(updated);
      setForm((f) => ({ ...f, twilioAuthToken: '', stripeSecretKey: '', stripeWebhookSecret: '' }));
      toast.success('Postavke sačuvane.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška pri čuvanju.');
    } finally {
      setSaving(false);
    }
  }

  if (!token || !restaurant) return null;

  return (
    <AppShell>
      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Postavke</h1>
          <p className="text-muted-foreground">Konfiguracija restorana, printera i integracija.</p>
        </div>

        <SettingsSection icon={Store} title="Restoran" description="Osnovni podaci - vidljivi gostima na meniju i računima.">
          <div className="grid grid-cols-2 gap-4">
            <Field className="col-span-2" label="Naziv restorana" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Field className="col-span-2" label="Adresa" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
          </div>
        </SettingsSection>

        <SettingsSection icon={Printer} title="Printeri" description="IP adrese termalnih printera za Smart Routing.">
          <div className="grid grid-cols-2 gap-4">
            <Field label="IP kuhinjskog printera" value={form.kitchenPrinterIp} onChange={(v) => setForm((f) => ({ ...f, kitchenPrinterIp: v }))} placeholder="192.168.1.150" />
            <Field label="Port" value={form.kitchenPrinterPort} onChange={(v) => setForm((f) => ({ ...f, kitchenPrinterPort: v }))} placeholder="9100" type="number" />
            <Field label="IP šank printera" value={form.barPrinterIp} onChange={(v) => setForm((f) => ({ ...f, barPrinterIp: v }))} placeholder="192.168.1.151" />
            <Field label="Port" value={form.barPrinterPort} onChange={(v) => setForm((f) => ({ ...f, barPrinterPort: v }))} placeholder="9100" type="number" />
          </div>
        </SettingsSection>

        <SettingsSection icon={ShieldAlert} title="Anti-fraud (geofencing)" description="Opciono - ostavi prazno da isključiš. Gost mora dozvoliti pristup lokaciji da bi naručio ako je radijus podešen.">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude restorana" value={form.latitude} onChange={(v) => setForm((f) => ({ ...f, latitude: v }))} placeholder="42.9186" />
            <Field label="Longitude restorana" value={form.longitude} onChange={(v) => setForm((f) => ({ ...f, longitude: v }))} placeholder="17.6119" />
            <Field label="Radijus (metara)" value={form.geofenceRadiusMeters} onChange={(v) => setForm((f) => ({ ...f, geofenceRadiusMeters: v }))} placeholder="150" type="number" />
            <Field label="Dozvoljena javna IP (Wi-Fi)" value={form.allowedIp} onChange={(v) => setForm((f) => ({ ...f, allowedIp: v }))} placeholder="93.87.xxx.xxx" />
          </div>
        </SettingsSection>

        <SettingsSection icon={ClipboardCheck} title="Narudžbe">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Konobar mora odobriti narudžbu prije slanja u kuhinju (samo za narudžbe preko QR koda)</span>
            <Switch
              checked={form.requireOrderApproval}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, requireOrderApproval: checked }))}
            />
          </label>
        </SettingsSection>

        <SettingsSection icon={MessageCircle} title="SMS/WhatsApp podsjetnici (Twilio)" description="Potreban vlastiti Twilio nalog. Bez ovoga, podsjetnici se ne šalju (samo bilježe kao neuspjeli, ne ruše rezervaciju).">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Account SID" value={form.twilioAccountSid} onChange={(v) => setForm((f) => ({ ...f, twilioAccountSid: v }))} placeholder="ACxxxxxxxx" />
            <Field
              label={`Auth Token ${restaurant.twilioAuthTokenSet ? '(postavljeno)' : '(nije postavljeno)'}`}
              value={form.twilioAuthToken}
              onChange={(v) => setForm((f) => ({ ...f, twilioAuthToken: v }))}
              placeholder="••••••••"
              secret
            />
            <Field className="col-span-2" label="From broj (SMS: +387..., WhatsApp: whatsapp:+387...)" value={form.twilioFromNumber} onChange={(v) => setForm((f) => ({ ...f, twilioFromNumber: v }))} placeholder="+38761xxxxxx" />
          </div>
        </SettingsSection>

        <SettingsSection icon={CreditCard} title="Online plaćanje (Stripe)" description={'Potreban vlastiti Stripe nalog. Bez ovoga, takeaway narudžbe sa "kartica" ostaju "plaćanje pri preuzimanju".'}>
          <Field
            label={`Stripe Secret Key ${restaurant.stripeSecretKeySet ? '(postavljeno)' : '(nije postavljeno)'}`}
            value={form.stripeSecretKey}
            onChange={(v) => setForm((f) => ({ ...f, stripeSecretKey: v }))}
            placeholder="sk_live_••••••••"
            secret
          />
          <p className="text-xs text-muted-foreground">
            Webhook URL za Stripe dashboard:{' '}
            <code className="rounded bg-muted px-1 py-0.5 break-all">
              {(process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '')}/payments/webhook/{restaurant.id}
            </code>
          </p>
          <Field
            label={`Webhook Secret ${restaurant.stripeWebhookSecretSet ? '(postavljeno)' : '(nije postavljeno)'}`}
            value={form.stripeWebhookSecret}
            onChange={(v) => setForm((f) => ({ ...f, stripeWebhookSecret: v }))}
            placeholder="whsec_••••••••"
            secret
          />
        </SettingsSection>

        <Button type="submit" disabled={saving} size="lg" className="w-fit">
          {saving ? 'Čuvanje…' : 'Sačuvaj postavke'}
        </Button>
      </form>
    </AppShell>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  secret = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  secret?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-muted-foreground font-normal">{label}</Label>
      <Input
        type={secret ? 'password' : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1"
        autoComplete="off"
      />
    </div>
  );
}
