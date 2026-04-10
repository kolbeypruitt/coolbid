import { Html, Head, Body, Container, Hr, Text } from "@react-email/components";

export function EmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f4f4f5", padding: "20px" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: "8px", padding: "32px", maxWidth: "480px" }}>
          {children}
          <Hr style={{ borderColor: "#e4e4e7" }} />
          <Text style={{ fontSize: "12px", color: "#a1a1aa" }}>
            CoolBid — Professional HVAC estimating
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const headingStyle = { fontSize: "20px", fontWeight: "bold", color: "#18181b" } as const;
export const bodyTextStyle = { color: "#52525b", lineHeight: "1.6" } as const;
export const buttonStyle = {
  backgroundColor: "#06b6d4",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontWeight: "bold",
  textDecoration: "none",
} as const;
export const ctaSectionStyle = { textAlign: "center" as const, margin: "24px 0" } as const;
