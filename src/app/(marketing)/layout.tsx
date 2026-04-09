import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            CoolBid
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className={cn(buttonVariants({ variant: "ghost" }))}
            >
              Sign in
            </Link>
            <Link
              href="/auth/register"
              className={cn(buttonVariants())}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
