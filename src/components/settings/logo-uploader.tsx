"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

export function LogoUploader({
  initialLogoUrl,
  initialContentType,
}: {
  initialLogoUrl: string | null;
  initialContentType: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [, setContentType] = useState<string | null>(initialContentType);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadPreview(path: string) {
    const supabase = createClient();
    const { data } = await supabase.storage
      .from("profile-logos")
      .createSignedUrl(path, 3600);
    setPreviewUrl(data?.signedUrl ?? null);
  }

  // Hydrate preview on mount if we already have a logo
  if (logoUrl && previewUrl === null) {
    void loadPreview(logoUrl);
  }

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please upload a PNG, JPG, or SVG file");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Logo must be 1 MB or smaller");
      return;
    }

    setLoading(true);
    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/profile/logo", {
      method: "POST",
      body: form,
    });

    const json = (await res.json()) as
      | { logo_url: string; logo_content_type: string }
      | { error: string };

    setLoading(false);

    if (!res.ok || "error" in json) {
      setError("error" in json ? json.error : "Upload failed");
      return;
    }

    setLogoUrl(json.logo_url);
    setContentType(json.logo_content_type);
    await loadPreview(json.logo_url);
  }

  async function handleRemove() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/profile/logo", { method: "DELETE" });
    setLoading(false);

    if (!res.ok) {
      setError("Failed to remove logo");
      return;
    }

    setLogoUrl(null);
    setContentType(null);
    setPreviewUrl(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-32 items-center justify-center rounded-lg border border-border bg-bg-input">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Company logo preview"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-txt-tertiary">No logo</span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {logoUrl ? "Replace" : "Upload logo"}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={handleRemove}
            >
              <X className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-txt-tertiary">
        PNG, JPG, or SVG. Max 1 MB. Shows on your customer-facing quotes.
      </p>

      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
