"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeedbackStore } from "@/stores/feedback-store";
import {
  FEEDBACK_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_PLACEHOLDERS,
} from "@/types/feedback";
import type { FeedbackCategory } from "@/types/feedback";
import { sendFeedback } from "@/lib/actions/send-feedback";

export function FeedbackModal() {
  const { isOpen, defaultCategory, close } = useFeedbackStore();
  const pathname = usePathname();

  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCategory(defaultCategory);
      setMessage("");
    }
  }, [isOpen, defaultCategory]);

  async function handleSubmit() {
    if (!message.trim()) return;

    setSending(true);
    try {
      const result = await sendFeedback({
        category,
        message,
        pageUrl: pathname,
      });

      if (result.ok) {
        toast.success("Thanks for your feedback!");
        close();
      } else {
        toast.error(result.reason);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="bg-gradient-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-txt-primary">
            <MessageSquare className="h-5 w-5 text-accent-light" />
            Send Feedback
          </DialogTitle>
          <DialogDescription className="text-txt-secondary">
            We&apos;re building this for you — tell us what you think.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-txt-primary">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as FeedbackCategory)}
            >
              <SelectTrigger className="border-border bg-bg-input text-txt-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message" className="text-txt-primary">Message</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={CATEGORY_PLACEHOLDERS[category]}
              className="min-h-[120px] border-border bg-bg-input text-txt-primary placeholder:text-txt-tertiary"
              maxLength={5000}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={sending || !message.trim()}
            className="w-full bg-gradient-brand hover-lift"
          >
            {sending ? "Sending…" : "Send Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
