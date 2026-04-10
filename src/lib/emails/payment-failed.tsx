import { Section, Text, Button } from "@react-email/components";
import { EmailLayout, headingStyle, bodyTextStyle, buttonStyle, ctaSectionStyle } from "./layout";

interface PaymentFailedProps {
  portalUrl: string;
  isRetry?: boolean;
}

export function PaymentFailedEmail({ portalUrl, isRetry }: PaymentFailedProps) {
  return (
    <EmailLayout>
      <Text style={headingStyle}>
        {isRetry
          ? "Action needed: update your payment method"
          : "Your CoolBid payment didn't go through"}
      </Text>

      <Text style={bodyTextStyle}>
        {isRetry
          ? "We're still trying to process your payment. Update your card to keep uninterrupted access."
          : "Update your card to keep access. We'll retry automatically, but updating now ensures no disruption."}
      </Text>

      <Section style={ctaSectionStyle}>
        <Button href={portalUrl} style={buttonStyle}>
          Update Payment Method
        </Button>
      </Section>
    </EmailLayout>
  );
}
