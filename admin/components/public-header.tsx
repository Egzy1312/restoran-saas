import Link from 'next/link';
import { ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PublicHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">Restoran</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
          <Link href="/#features" className="text-muted-foreground hover:text-foreground">
            Mogućnosti
          </Link>
          <Link href="/#pricing" className="text-muted-foreground hover:text-foreground">
            Cijene
          </Link>
          <Link href="/shop" className="text-muted-foreground hover:text-foreground">
            Prodavnica
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Prijava</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Registruj se</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
