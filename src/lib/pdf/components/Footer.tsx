import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_SIZES } from "../tokens";

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    borderTop: `0.5px solid ${PDF_COLORS.border}`,
    paddingTop: 10,
    alignItems: "center",
  },
  text: {
    fontFamily: "Inter",
    fontSize: PDF_FONT_SIZES.footer,
    color: PDF_COLORS.textTertiary,
    letterSpacing: 0.5,
  },
});

export function Footer() {
  return (
    <View fixed style={styles.container}>
      <Text style={styles.text}>Made with coolbid · coolbid.app</Text>
    </View>
  );
}
