"use client";

import { Mail, Phone, MessageSquare } from "lucide-react";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_TEL } from "@/types/feedback";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useFeedbackStore } from "@/stores/feedback-store";

export function HelpFeedbackCard() {
  const open = useFeedbackStore((s) => s.open);

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <CardTitle className="text-txt-primary">Help & Feedback</CardTitle>
        <CardDescription className="text-txt-secondary">
          We&apos;re building this for you — reach out anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3 text-sm text-txt-secondary transition-colors hover:text-txt-primary"
          >
            <Mail className="h-4 w-4 text-accent-light" />
            {SUPPORT_EMAIL}
          </a>
          <a
            href={`tel:${SUPPORT_PHONE_TEL}`}
            className="flex items-center gap-3 text-sm text-txt-secondary transition-colors hover:text-txt-primary"
          >
            <Phone className="h-4 w-4 text-accent-light" />
            {SUPPORT_PHONE}
          </a>
        </div>
        <Button
          onClick={() => open()}
          className="w-full bg-gradient-brand hover-lift"
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Send Feedback
        </Button>
      </CardContent>
    </Card>
  );
}
