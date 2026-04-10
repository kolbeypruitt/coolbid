"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings, Package, MessageSquarePlus } from "lucide-react";
import { useFeedbackStore } from "@/stores/feedback-store";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/estimates", label: "Estimates", icon: FileText },
  { href: "/parts-database", label: "Parts Database", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [reviewCount, setReviewCount] = useState(0);
  const openFeedback = useFeedbackStore((s) => s.open);

  useEffect(() => {
    const supabase = createClient();

    async function loadCount() {
      const { count } = await supabase
        .from("quotes")
        .select("*", { count: "exact", head: true })
        .eq("status", "parsed");
      setReviewCount(count ?? 0);
    }

    loadCount();

    const channel = supabase
      .channel("review_count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quotes" },
        () => loadCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link
          href="/dashboard"
          className="text-xl font-bold text-gradient-brand tracking-tight"
        >
          CoolBid
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent-glow text-accent-light"
                  : "text-txt-secondary hover:bg-bg-card-hover hover:text-txt-primary"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.href === "/parts-database" && reviewCount > 0 && (
                <span className="ml-auto rounded-full bg-accent-glow text-accent-light px-2 py-0.5 text-xs font-semibold">
                  {reviewCount}
                </span>
              )}
            </Link>
          );
        })}
        <button
          onClick={() => openFeedback()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-txt-secondary transition-colors hover:bg-bg-card-hover hover:text-txt-primary"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Feedback
        </button>
      </nav>
    </aside>
  );
}
