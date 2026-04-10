import { Font } from "@react-pdf/renderer";

let registered = false;

/**
 * Register Inter once per process. Called lazily from the PDF renderer.
 * Uses the Google Fonts CDN for the TTF files.
 */
export function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: "Inter",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
        fontWeight: 400,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
        fontWeight: 500,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
        fontWeight: 600,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
        fontWeight: 700,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
        fontWeight: 800,
      },
    ],
  });

  // Disable hyphenation for a cleaner look
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
