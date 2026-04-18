import { Section, Text, Button, Hr } from "@react-email/components";
import {
  EmailLayout,
  headingStyle,
  bodyTextStyle,
  buttonStyle,
  ctaSectionStyle,
} from "./layout";

interface EstimateShareProps {
  customerName: string;
  projectName: string;
  companyName: string;
  totalPrice: number | null;
  shareUrl: string;
  validUntil: string | null;
  noteToCustomer: string | null;
}

export function EstimateShareEmail({
  customerName,
  projectName,
  companyName,
  totalPrice,
  shareUrl,
  validUntil,
  noteToCustomer,
}: EstimateShareProps) {
  const greetingName = customerName.trim() || "there";
  const sender = companyName.trim() || "Your HVAC contractor";
  const expiryText = validUntil
    ? `This quote is valid through ${new Date(validUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
    : null;

  return (
    <EmailLayout>
      <Text style={headingStyle}>Your HVAC estimate is ready</Text>
      <Text style={bodyTextStyle}>
        Hi {greetingName},
      </Text>
      <Text style={bodyTextStyle}>
        {sender} has prepared your estimate for <strong>{projectName}</strong>
        {totalPrice != null ? (
          <>
            . The total comes to{" "}
            <strong>
              $
              {totalPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
            .
          </>
        ) : (
          "."
        )}
      </Text>

      {noteToCustomer && (
        <>
          <Hr style={{ borderColor: "#e4e4e7" }} />
          <Section>
            <Text style={bodyTextStyle}>{noteToCustomer}</Text>
          </Section>
          <Hr style={{ borderColor: "#e4e4e7" }} />
        </>
      )}

      <Section style={ctaSectionStyle}>
        <Button href={shareUrl} style={buttonStyle}>
          View Estimate
        </Button>
      </Section>

      {expiryText && <Text style={bodyTextStyle}>{expiryText}</Text>}
    </EmailLayout>
  );
}
