import { Section, Text, Button } from "@react-email/components";
import { EmailLayout, headingStyle, bodyTextStyle, buttonStyle, ctaSectionStyle } from "./layout";

interface TrialExpiredProps {
  estimateCount: number;
  catalogCount: number;
  pricingUrl: string;
  isWinback?: boolean;
}

export function TrialExpiredEmail({
  estimateCount,
  catalogCount,
  pricingUrl,
  isWinback,
}: TrialExpiredProps) {
  return (
    <EmailLayout>
      <Text style={headingStyle}>
        {isWinback ? "Your estimates are still in CoolBid" : "Your CoolBid trial has ended"}
      </Text>

      <Text style={bodyTextStyle}>
        {isWinback
          ? `We kept everything — ${estimateCount} estimate${estimateCount !== 1 ? "s" : ""} and ${catalogCount} catalog items. Come back anytime.`
          : "Pick a plan to pick up where you left off. Your data is waiting."}
      </Text>

      <Section style={ctaSectionStyle}>
        <Button href={pricingUrl} style={buttonStyle}>
          Choose a Plan
        </Button>
      </Section>
    </EmailLayout>
  );
}
