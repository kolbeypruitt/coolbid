import { renderToBuffer } from "@react-pdf/renderer";
import { EstimateDocument } from "./components/Document";
import { registerPdfFonts } from "./fonts";
import { generateScopeOfWork } from "@/lib/share/scope-of-work";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export interface RenderEstimatePdfInput {
  estimate: EstimateRow;
  profile: ProfileRow;
  rooms: RoomRow[];
  bom: BomRow[];
  logoBuffer: Buffer | null;
}

export async function renderEstimatePdf(
  input: RenderEstimatePdfInput,
): Promise<Buffer> {
  registerPdfFonts();

  const scopeText =
    input.estimate.scope_of_work?.trim() ||
    generateScopeOfWork(input.estimate, input.bom);

  return renderToBuffer(
    <EstimateDocument
      estimate={input.estimate}
      profile={input.profile}
      bom={input.bom}
      scopeText={scopeText}
      logoBuffer={input.logoBuffer}
    />,
  );
}
