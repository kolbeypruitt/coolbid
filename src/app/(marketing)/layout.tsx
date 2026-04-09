import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass-header sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="coolbid home"
          >
            <Image
              src="/brand/logos/mark-primary.svg"
              alt=""
              width={32}
              height={32}
              priority
              className="h-8 w-8"
            />
            <span className="text-xl font-extrabold tracking-tight text-txt-primary">
              cool<span className="text-gradient-brand">bid</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <Link
              href="/#how-it-works"
              className="text-sm font-medium text-txt-secondary transition-colors hover:text-txt-primary"
            >
              How it works
            </Link>
            <Link
              href="/#features"
              className="text-sm font-medium text-txt-secondary transition-colors hover:text-txt-primary"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-txt-secondary transition-colors hover:text-txt-primary"
            >
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="hidden text-sm font-medium text-txt-secondary transition-colors hover:text-txt-primary sm:inline-block"
            >
              Sign in
            </Link>
            <Link href="/auth/signup">
              <Button className="bg-gradient-brand hover-lift text-white shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                Start free trial
              </Button>
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <div className="flex items-center gap-2">
            <Image
              src="/brand/logos/mark-primary.svg"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6"
            />
            <span className="text-sm text-txt-tertiary">
              © {new Date().getFullYear()} coolbid · Floorplan in. Bill of
              materials out.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-txt-tertiary">
            <Link href="/pricing" className="hover:text-txt-primary">
              Pricing
            </Link>
            <Link href="/auth/login" className="hover:text-txt-primary">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
