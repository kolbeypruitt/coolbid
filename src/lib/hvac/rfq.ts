import type { BomResult } from "@/types/hvac";

export type RfqConfig = {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  supplierName: string;
  projectName: string;
  customerName: string;
};

export function generateRFQText(bom: BomResult, config: RfqConfig): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);
  const validStr = validUntil.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const rfqNum = `RFQ-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 9000) + 1000}`;

  const lines: string[] = [];

  lines.push("=".repeat(72));
  lines.push("REQUEST FOR QUOTATION");
  lines.push("=".repeat(72));
  lines.push(`RFQ #:          ${rfqNum}`);
  lines.push(`Date:           ${dateStr}`);
  lines.push(`Valid Until:    ${validStr}`);
  lines.push("");
  lines.push(`FROM:           ${config.companyName}`);
  lines.push(`                Phone: ${config.companyPhone}`);
  lines.push(`                Email: ${config.companyEmail}`);
  lines.push("");
  lines.push(`TO:             ${config.supplierName}`);
  lines.push("");
  lines.push(`Project:        ${config.projectName}`);
  lines.push(`Customer:       ${config.customerName}`);
  lines.push("-".repeat(72));

  // Group items by category
  const byCategory = new Map<string, typeof bom.items>();
  for (const item of bom.items) {
    const cat = item.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  let lineNum = 1;
  for (const [category, items] of byCategory) {
    lines.push("");
    lines.push(`  ${category.toUpperCase()}`);
    lines.push("  " + "-".repeat(68));
    lines.push(
      `  ${"#".padEnd(4)} ${"Description".padEnd(36)} ${"Mfr/SKU".padEnd(16)} ${"Qty".padStart(5)} ${"Unit".padEnd(4)} ${"Unit Price".padStart(10)}`,
    );
    lines.push("  " + "-".repeat(68));
    for (const item of items) {
      const skuShort = item.sku.slice(0, 14);
      lines.push(
        `  ${String(lineNum).padEnd(4)} ${item.name.slice(0, 36).padEnd(36)} ${skuShort.padEnd(16)} ${String(item.qty).padStart(5)} ${item.unit.padEnd(4)} ${"________".padStart(10)}`,
      );
      lineNum++;
    }
  }

  lines.push("");
  lines.push("=".repeat(72));
  lines.push("NOTES:");
  lines.push("  - Please provide unit pricing and lead times for all items");
  lines.push("  - Quote valid for 30 days from receipt");
  lines.push("  - Indicate any substitutions or unavailable items");
  lines.push(`  - System: ${bom.summary.tonnage}-Ton, ${bom.summary.designBTU.toLocaleString()} BTU design load`);
  lines.push(`  - Zones: ${bom.summary.zones}`);
  lines.push("=".repeat(72));

  return lines.join("\n");
}

export function generateRFQCSV(bom: BomResult): string {
  const headers = ["Item #", "Category", "Description", "Manufacturer", "SKU", "Qty", "Unit", "Your Unit Price", "Your Extended Price", "Lead Time", "Notes"];
  const rows: string[][] = [headers];

  let lineNum = 1;
  for (const item of bom.items) {
    rows.push([
      String(lineNum),
      item.category,
      item.name,
      item.supplier,
      item.sku,
      String(item.qty),
      item.unit,
      "",
      "",
      "",
      item.notes,
    ]);
    lineNum++;
  }

  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(","),
    )
    .join("\n");
}
