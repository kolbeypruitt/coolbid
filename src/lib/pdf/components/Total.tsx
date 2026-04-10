import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";

const styles = StyleSheet.create({
  container: {
    backgroundColor: PDF_COLORS.totalBg,
    border: `1px solid ${PDF_COLORS.totalBorder}`,
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.label,
    fontWeight: 700,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  value: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.total,
    fontWeight: 800,
    color: PDF_COLORS.accentDark,
    letterSpacing: -1,
  },
});

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function Total({ amount }: { amount: number }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Total</Text>
      <Text style={styles.value}>{formatCurrency(amount)}</Text>
    </View>
  );
}
