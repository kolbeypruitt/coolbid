"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { CatalogTable } from "@/components/parts-database/catalog-table";
import { EmailConnectionsSection } from "@/components/parts-database/email-connections-section";

export default function PartsDatabasePage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-txt-primary">Parts Database</h1>
        <Link
          href="/parts-database/upload"
          className={cn(buttonVariants(), "bg-gradient-brand hover-lift")}
        >
          <Upload className="mr-2 size-4" />
          Upload Quote
        </Link>
      </div>
      <EmailConnectionsSection />
      <CatalogTable />
    </div>
  );
}
