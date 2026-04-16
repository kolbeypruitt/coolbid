"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ExternalLink, Plus, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type VendorProduct = {
  id: string;
  vendor_id: string;
  sku: string;
  mpn: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  short_description: string | null;
  category_root: string | null;
  category_path: string | null;
  category_leaf: string | null;
  detail_url: string | null;
  price: number | null;
  price_text: string | null;
  last_priced_at: string | null;
  specifications: Record<string, string> | null;
  features: Record<string, string> | null;
  documents: Record<string, string> | null;
  additional_images: string[] | null;
  vendor: { id: string; slug: string; name: string } | null;
};

interface VendorProductDetailProps {
  productId: string;
}

export function VendorProductDetail({ productId }: VendorProductDetailProps) {
  const router = useRouter();
  const [product, setProduct] = useState<VendorProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/catalog/vendor/${productId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load product (${res.status})`);
        return res.json() as Promise<VendorProduct>;
      })
      .then(setProduct)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load product");
      })
      .finally(() => setLoading(false));
  }, [productId]);

  async function handleImport() {
    if (!product) return;
    setImporting(true);
    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "imported",
          vendor_product_id: product.id,
          mpn: product.sku,
          description: product.name,
          equipment_type: "installation",
          brand: product.brand ?? "",
          unit_price: product.price ?? null,
          unit_of_measure: "ea",
        }),
      });
      if (!res.ok) throw new Error(`Import failed: ${res.status}`);
      const catalogItem = (await res.json()) as { id: string };
      router.push(`/parts-database/${catalogItem.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div role="status" className="py-20 text-center text-sm text-txt-secondary">
        Loading…
      </div>
    );
  }

  if (error || !product) {
    return (
      <div role="alert" className="py-20 text-center text-sm text-destructive">
        {error ?? "Product not found."}
      </div>
    );
  }

  const specs = product.specifications;
  const features = product.features;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/parts-database"
          className="inline-flex items-center gap-1 text-sm text-txt-secondary hover:text-txt-primary"
        >
          <ArrowLeft className="size-4" />
          Back to parts
        </Link>
        <Button
          className="bg-gradient-brand hover-lift"
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {importing ? "Importing…" : "Import to My Parts"}
        </Button>
      </div>

      <Card className="bg-gradient-card border-b-accent">
        <CardHeader>
          <div className="flex items-start gap-6">
            {product.image_url && (
              <div className="shrink-0 rounded-md border border-border bg-white overflow-hidden">
                <Image
                  src={product.image_url}
                  alt={product.name}
                  width={200}
                  height={200}
                  className="object-contain"
                  unoptimized
                />
              </div>
            )}
            <div className="space-y-1.5">
              <CardTitle className="text-txt-primary">{product.name}</CardTitle>
              {product.mpn && (
                <p className="text-sm text-txt-secondary">
                  <span className="text-txt-tertiary">MPN:</span>{" "}
                  <span className="font-mono">{product.mpn}</span>
                </p>
              )}
              <p className="text-sm text-txt-secondary">
                <span className="text-txt-tertiary">SKU:</span>{" "}
                <span className="font-mono">{product.sku}</span>
              </p>
              {product.brand && (
                <p className="text-sm text-txt-secondary">{product.brand}</p>
              )}
              {product.short_description && (
                <p className="text-sm text-txt-tertiary mt-2">{product.short_description}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                {product.vendor && (
                  <Badge className="bg-bg-elevated text-txt-tertiary border border-border">
                    {product.vendor.name}
                  </Badge>
                )}
                {product.detail_url && (
                  <a
                    href={product.detail_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    View on supplier site
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Price</dt>
              <dd className="text-txt-primary font-medium">
                {product.price != null
                  ? `$${product.price.toFixed(2)}`
                  : product.price_text ?? "No price"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Category</dt>
              <dd className="text-txt-primary font-medium">
                {product.category_leaf ?? product.category_root ?? "—"}
              </dd>
            </div>
            {product.category_path && (
              <div>
                <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Category Path</dt>
                <dd className="text-txt-primary font-medium text-xs">{product.category_path}</dd>
              </div>
            )}
            {product.last_priced_at && (
              <div>
                <dt className="text-xs uppercase tracking-wider text-txt-tertiary">Price Date</dt>
                <dd className="text-txt-primary font-medium">
                  {new Date(product.last_priced_at).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {specs && Object.keys(specs).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-txt-primary">Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
              {Object.entries(specs).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="text-txt-tertiary min-w-[140px]">{key}</dt>
                  <dd className="text-txt-primary font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {features && Object.keys(features).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-txt-primary">Features</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
              {Object.entries(features).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="text-txt-tertiary min-w-[140px]">{key}</dt>
                  <dd className="text-txt-primary font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
