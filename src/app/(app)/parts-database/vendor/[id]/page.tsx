"use client";

import { use } from "react";
import { VendorProductDetail } from "@/components/parts-database/vendor-product-detail";

export default function VendorProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <VendorProductDetail productId={id} />;
}
