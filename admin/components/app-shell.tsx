'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  UtensilsCrossed,
  LayoutGrid,
  CalendarCheck,
  BarChart3,
  Users,
  Settings,
  CreditCard,
  ShieldCheck,
  Menu as MenuIcon,
  LogOut,
  ChefHat,
} from 'lucide-react';
import { clearSession, getStaffUser } from '@/lib/auth';
import { resendVerification } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Pregled', icon: LayoutDashboard },
  { href: '/menu', label: 'Meni', icon: UtensilsCrossed },
  { href: '/tables', label: 'Stolovi', icon: LayoutGrid },
  { href: '/reservations', label: 'Rezervacije', icon: CalendarCheck },
  { href: '/analytics', label: 'Analitika', icon: BarChart3 },
  { href: '/staff', label: 'Osoblje', icon: Users },
  { href: '/settings', label: 'Postavke', icon: Settings },
  { href: '/billing', label: 'Naplata', icon: CreditCard },
  { href: '/account', label: 'Nalog', icon: ShieldCheck },
];

// Najcesce koriscene stavke - prikazuju se u donjoj traci na mobitelu (ostatak je iza "Meni" hamburger-a).
const MOBILE_TAB_ITEMS = NAV_ITEMS.slice(0, 4);

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Zamjenjuje stari AdminNav (gola horizontalna traka) - responzivan app shell:
 * fiksni sidebar na desktopu (md+), gornja traka + hamburger meni + donja
 * tab traka sa najcescim stavkama na mobitelu/tabletu (konobar/osoblje
 * realno najcesce koriste ovo na manjem ekranu).
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStaffUser();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  if (user?.role === 'SUPER_ADMIN') return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">Restoran</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks pathname={pathname} />
        </div>
        <div className="border-t p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                  {user?.full_name?.slice(0, 2).toUpperCase()}
                </div>
                <span className="flex-1 truncate font-medium">{user?.full_name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Odjava
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Top bar - mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <MenuIcon className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ChefHat className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold">Restoran</span>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>

        <span className="font-bold text-primary">Restoran</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              {user?.full_name?.slice(0, 2).toUpperCase()}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Odjava
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Ne blokira koristenje - samo podsjetnik (vidi AuthService.register/verifyEmail). */}
      {user && !user.email_verified && (
        <div className="flex items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800 md:ml-64 dark:bg-amber-950/30 dark:text-amber-200">
          <span>Molimo potvrdite svoj email ({user.email}).</span>
          {resent ? (
            <span className="text-amber-600">Poslato!</span>
          ) : (
            <button onClick={onResendVerification} className="font-medium underline">
              Pošalji ponovo
            </button>
          )}
        </div>
      )}

      <main className="pb-20 md:ml-64 md:pb-0">
        <div className="mx-auto max-w-6xl p-4 sm:p-6">{children}</div>
      </main>

      {/* Donja tab traka - mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-card md:hidden">
        {MOBILE_TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-xs font-medium',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
