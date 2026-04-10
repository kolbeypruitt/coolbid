import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  title: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.label,
    fontWeight: 700,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  body: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    color: PDF_COLORS.text,
    lineHeight: 1.5,
  },
});

export function Scope({ text }: { text: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scope of work</Text>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}
