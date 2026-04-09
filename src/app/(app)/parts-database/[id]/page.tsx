"use client";

import { use } from "react";
import { CatalogDetail } from "@/components/parts-database/catalog-detail";

export default function CatalogItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CatalogDetail itemId={id} />;
}
