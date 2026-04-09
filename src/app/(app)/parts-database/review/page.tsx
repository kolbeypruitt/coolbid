import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReviewQueue } from "@/components/parts-database/review-queue";

export default function ReviewQueuePage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/parts-database"
          className="text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-txt-primary">Review Queue</h1>
      </div>
      <ReviewQueue />
    </div>
  );
}
