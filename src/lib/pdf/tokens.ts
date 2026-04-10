// Color and spacing tokens for the customer-facing PDF.
// Light theme — the PDF is printed and forwarded, dark burns toner.

export const PDF_COLORS = {
  text: "#0B0F1A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  border: "#E2E8F0",
  accent: "#06B6D4",
  accentDark: "#0891B2",
  coolBlue: "#3B82F6",
  bgSubtle: "#F8FAFC",
  totalBg: "#ECFEFF",
  totalBorder: "#A5F3FC",
} as const;

export const PDF_SPACING = {
  page: 48,
  sectionGap: 24,
  rowGap: 6,
} as const;

export const PDF_FONT_SIZES = {
  companyName: 24,
  title: 14,
  label: 9,
  body: 11,
  bomRow: 10,
  total: 32,
  footer: 8,
} as const;
