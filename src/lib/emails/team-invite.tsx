import { Section, Text, Button } from "@react-email/components";
import { EmailLayout, headingStyle, bodyTextStyle, buttonStyle, ctaSectionStyle } from "./layout";

interface TeamInviteProps {
  companyName: string;
  signupUrl: string;
}

export function TeamInviteEmail({ companyName, signupUrl }: TeamInviteProps) {
  return (
    <EmailLayout>
      <Text style={headingStyle}>
        {"You're invited to join "}{companyName}{" on CoolBid"}
      </Text>

      <Text style={bodyTextStyle}>
        {companyName} invited you to their team. Sign up to start creating professional HVAC estimates.
      </Text>

      <Section style={ctaSectionStyle}>
        <Button href={signupUrl} style={buttonStyle}>
          Join Team
        </Button>
      </Section>
    </EmailLayout>
  );
}
