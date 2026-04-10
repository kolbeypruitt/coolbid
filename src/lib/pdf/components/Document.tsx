import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_SPACING } from "../tokens";
import { Header } from "./Header";
import { Proposal } from "./Proposal";
import { Scope } from "./Scope";
import { BomTable } from "./BomTable";
import { Total } from "./Total";
import { Message } from "./Message";
import { Footer } from "./Footer";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_SPACING.page,
    paddingBottom: PDF_SPACING.page + 32,
    paddingHorizontal: PDF_SPACING.page,
    backgroundColor: "#FFFFFF",
    fontFamily: "Inter",
    color: PDF_COLORS.text,
  },
});

export function EstimateDocument({
  estimate,
  profile,
  bom,
  scopeText,
  logoBuffer,
}: {
  estimate: EstimateRow;
  profile: ProfileRow;
  bom: BomRow[];
  scopeText: string;
  logoBuffer: Buffer | null;
}) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Header profile={profile} logoBuffer={logoBuffer} />
        <Proposal estimate={estimate} />
        <Scope text={scopeText} />
        {estimate.display_mode === "itemized" && bom.length > 0 && (
          <BomTable items={bom} />
        )}
        <Total amount={estimate.total_price ?? 0} />
        {estimate.note_to_customer && (
          <Message text={estimate.note_to_customer} />
        )}
        <Footer />
      </Page>
    </Document>
  );
}
