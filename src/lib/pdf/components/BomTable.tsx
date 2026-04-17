import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";
import { compareBomCategories } from "@/lib/hvac/bom-generator";
import type { Database } from "@/types/database";

type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  category: { marginBottom: 14 },
  categoryTitle: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.label,
    fontWeight: 700,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    borderBottom: `0.5px solid ${PDF_COLORS.border}`,
    paddingVertical: 5,
  },
  description: {
    flex: 1,
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.bomRow,
    color: PDF_COLORS.text,
  },
  qty: {
    width: 50,
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.bomRow,
    color: PDF_COLORS.textSecondary,
    textAlign: "right",
  },
  lineTotal: {
    width: 80,
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.bomRow,
    fontWeight: 600,
    color: PDF_COLORS.text,
    textAlign: "right",
  },
});

const CATEGORY_LABELS: Record<string, string> = {
  equipment: "Equipment",
  ductwork: "Ductwork",
  accessories: "Accessories",
  labor: "Labor",
  other: "Other",
};

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function BomTable({ items }: { items: BomRow[] }) {
  const grouped = new Map<string, BomRow[]>();
  for (const item of items) {
    const bucket = grouped.get(item.category) ?? [];
    bucket.push(item);
    grouped.set(item.category, bucket);
  }

  return (
    <View style={styles.container}>
      {Array.from(grouped.entries())
        .sort(([a], [b]) => compareBomCategories(a, b))
        .map(([category, rows]) => (
          <View key={category} style={styles.category}>
            <Text style={styles.categoryTitle}>
              {CATEGORY_LABELS[category] ?? category}
            </Text>
            {rows.map((row) => (
              <View key={row.id} style={styles.row}>
                <Text style={styles.description}>{row.description}</Text>
                <Text style={styles.qty}>
                  {row.quantity} {row.unit}
                </Text>
                <Text style={styles.lineTotal}>
                  {formatCurrency(row.total_cost)}
                </Text>
              </View>
            ))}
          </View>
        ))}
    </View>
  );
}
