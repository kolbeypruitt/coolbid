import { Section, Text, Button } from "@react-email/components";
import { EmailLayout, headingStyle, bodyTextStyle, buttonStyle, ctaSectionStyle } from "./layout";

interface TrialReminderProps {
  daysLeft: number;
  estimateCount: number;
  catalogCount: number;
  pricingUrl: string;
}

export function TrialReminderEmail({
  daysLeft,
  estimateCount,
  catalogCount,
  pricingUrl,
}: TrialReminderProps) {
  const isUrgent = daysLeft <= 2;

  return (
    <EmailLayout>
      <Text style={headingStyle}>
        {isUrgent
          ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left on your CoolBid trial`
          : `Your CoolBid trial ends in ${daysLeft} days`}
      </Text>

      {estimateCount > 0 || catalogCount > 0 ? (
        <Text style={bodyTextStyle}>
          {"You've built "}
          {estimateCount} estimate{estimateCount !== 1 ? "s" : ""} and added{" "}
          {catalogCount} items to your catalog.
          {isUrgent
            ? " Don't lose access — pick a plan to keep going."
            : " Pick a plan to keep the momentum going."}
        </Text>
      ) : (
        <Text style={bodyTextStyle}>
          {isUrgent
            ? "Your data is safe, but you'll lose access when the trial ends. Pick a plan to continue."
            : "Your free trial is ending soon. Choose a plan to keep using CoolBid."}
        </Text>
      )}

      <Section style={ctaSectionStyle}>
        <Button href={pricingUrl} style={buttonStyle}>
          View Plans
        </Button>
      </Section>
    </EmailLayout>
  );
}
