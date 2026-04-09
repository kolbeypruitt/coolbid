"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmailConnectButton() {
  return (
    <Button
      onClick={() => {
        window.location.href = "/api/auth/gmail/connect";
      }}
      className="bg-gradient-brand hover-lift"
    >
      <Mail className="mr-2 h-4 w-4" />
      Connect Gmail
    </Button>
  );
}
