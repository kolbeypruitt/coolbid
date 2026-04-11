import { Badge } from "@/components/ui/badge";

export function SourceBadge({ source }: { source: string }) {
  if (source === "quote") {
    return <Badge variant="default" className="bg-green-600 text-white">Quoted</Badge>;
  }
  if (source === "starter") {
    return <Badge variant="outline">Starter</Badge>;
  }
  if (source === "manual") {
    return <Badge variant="default" className="bg-blue-600 text-white">Manual</Badge>;
  }
  if (source === "missing") {
    return <Badge variant="destructive">Missing</Badge>;
  }
  return null;
}
