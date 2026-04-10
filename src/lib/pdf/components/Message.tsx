import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    paddingTop: 16,
    borderTop: `1px solid ${PDF_COLORS.border}`,
  },
  body: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.body,
    color: PDF_COLORS.text,
    lineHeight: 1.5,
    fontStyle: "italic",
  },
});

export function Message({ text }: { text: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}
