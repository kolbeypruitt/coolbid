import { Section, Text, Hr } from "@react-email/components";
import {
  EmailLayout,
  headingStyle,
  bodyTextStyle,
} from "./layout";

interface FeedbackReceivedProps {
  category: string;
  userName: string;
  userEmail: string;
  companyName: string;
  plan: string;
  trialDay: number | null;
  pageUrl: string;
  message: string;
}

export function FeedbackReceivedEmail({
  category,
  userName,
  userEmail,
  companyName,
  plan,
  trialDay,
  pageUrl,
  message,
}: FeedbackReceivedProps) {
  const planLabel =
    trialDay !== null ? `${plan} (Trial — Day ${trialDay})` : plan;

  return (
    <EmailLayout>
      <Text style={headingStyle}>New Feedback: {category}</Text>
      <Text style={bodyTextStyle}>
        <strong>From:</strong> {userName} ({userEmail})
        <br />
        <strong>Company:</strong> {companyName}
        <br />
        <strong>Plan:</strong> {planLabel}
        <br />
        <strong>Page:</strong> {pageUrl}
      </Text>
      <Hr style={{ borderColor: "#e4e4e7" }} />
      <Section>
        <Text style={bodyTextStyle}>{message}</Text>
      </Section>
    </EmailLayout>
  );
}
