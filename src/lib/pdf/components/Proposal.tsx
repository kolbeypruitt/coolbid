import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  title: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.label,
    fontWeight: 700,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  row: { flexDirection: "row", marginBottom: 4 },
  label: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    color: PDF_COLORS.textSecondary,
    width: 90,
  },
  value: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    fontWeight: 600,
    color: PDF_COLORS.text,
    flex: 1,
  },
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function Proposal({ estimate }: { estimate: EstimateRow }) {
  const preparedOn = formatDate(estimate.created_at);
  const validUntil = estimate.valid_until ? formatDate(estimate.valid_until) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Proposal</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Prepared for</Text>
        <Text style={styles.value}>
          {estimate.customer_name?.trim() || "—"}
        </Text>
      </View>
      {estimate.job_address && (
        <View style={styles.row}>
          <Text style={styles.label}>Job address</Text>
          <Text style={styles.value}>{estimate.job_address}</Text>
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.label}>Prepared on</Text>
        <Text style={styles.value}>{preparedOn}</Text>
      </View>
      {validUntil && (
        <View style={styles.row}>
          <Text style={styles.label}>Valid until</Text>
          <Text style={styles.value}>{validUntil}</Text>
        </View>
      )}
    </View>
  );
}
