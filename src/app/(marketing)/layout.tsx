import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass-header sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border px-6">
        <Link href="/" className="text-xl font-bold text-gradient-brand tracking-tight">
          CoolBid
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/auth/login"
            className="text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors"
          >
            Sign in
          </Link>
          <Link href="/auth/signup">
            <Button className="bg-gradient-brand hover-lift text-white shadow-[0_0_20px_rgba(6,182,212,0.15)]">
              Start free trial
            </Button>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
