import { Badge } from "@/components/ui/badge";

export function SourceBadge({ source }: { source: string }) {
  if (source === "quote") {
    return <Badge variant="default" className="bg-green-600 text-white">Quoted</Badge>;
  }
  if (source === "imported") {
    return <Badge variant="default" className="bg-cyan-600 text-white">Imported</Badge>;
  }
  if (source === "manual") {
    return <Badge variant="default" className="bg-blue-600 text-white">Manual</Badge>;
  }
  if (source === "missing") {
    return <Badge variant="destructive">Missing</Badge>;
  }
  if (source === "starter") {
    // Legacy rows shouldn't exist after migration 016, but keep the
    // branch so any still-in-flight historical BOM items render.
    return <Badge variant="outline">Starter</Badge>;
  }
  return null;
}
