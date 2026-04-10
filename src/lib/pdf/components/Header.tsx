import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottom: `1px solid ${PDF_COLORS.border}`,
    paddingBottom: 16,
    marginBottom: 20,
  },
  logoBlock: {
    marginRight: 16,
  },
  logo: {
    maxHeight: 56,
    maxWidth: 200,
    objectFit: "contain",
  },
  textBlock: {
    flex: 1,
  },
  companyName: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.companyName,
    fontWeight: 800,
    color: PDF_COLORS.text,
    letterSpacing: -0.5,
  },
  contact: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    color: PDF_COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 1.4,
  },
});

export function Header({
  profile,
  logoBuffer,
}: {
  profile: ProfileRow;
  logoBuffer: Buffer | null;
}) {
  const contactLines = [
    profile.address?.trim(),
    [profile.state?.trim(), profile.zip?.trim()].filter(Boolean).join(" ") ||
      null,
    [profile.company_phone?.trim(), profile.company_email?.trim()]
      .filter(Boolean)
      .join(" · ") || null,
  ].filter(Boolean);

  return (
    <View style={styles.container}>
      {logoBuffer && (
        <View style={styles.logoBlock}>
          <Image src={logoBuffer} style={styles.logo} />
        </View>
      )}
      <View style={styles.textBlock}>
        <Text style={styles.companyName}>
          {profile.company_name?.trim() || "Your HVAC Company"}
        </Text>
        {contactLines.map((line) => (
          <Text key={line} style={styles.contact}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}
