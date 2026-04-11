import type { AnalysisResult } from "@/types/hvac";

interface ValidateOptions {
  perUnitAnalysis?: boolean;
}

export function validateAnalysis(
  result: AnalysisResult,
  options: ValidateOptions = {}
): AnalysisResult {
  const warnings: string[] = [];
  const seen = new Set<string>();

  const rooms = result.rooms.map((room) => {
    const patched = { ...room };

    // Ceiling height: Zod defaults to 9, but Claude may return 0
    if (patched.ceiling_height <= 0) {
      patched.ceiling_height = 9;
    }

    // Width × length consistency: recompute sqft from dimensions if they diverge
    if (patched.width_ft > 0 && patched.length_ft > 0) {
      const computed = patched.width_ft * patched.length_ft;
      const diff = Math.abs(computed - patched.estimated_sqft);
      if (patched.estimated_sqft > 0 && diff / patched.estimated_sqft > 0.15) {
        warnings.push(
          `Room "${patched.name}": sqft ${patched.estimated_sqft} did not match ${patched.width_ft}×${patched.length_ft}=${computed.toFixed(0)}, corrected to ${computed.toFixed(0)}`
        );
        patched.estimated_sqft = Math.round(computed);
      }
    }

    // Impossible dimensions
    if (patched.width_ft > 0 && (patched.width_ft < 3 || patched.width_ft > 50)) {
      warnings.push(`Room "${patched.name}": width ${patched.width_ft} ft seems unusual`);
    }
    if (patched.length_ft > 0 && (patched.length_ft < 3 || patched.length_ft > 50)) {
      warnings.push(`Room "${patched.name}": length ${patched.length_ft} ft seems unusual`);
    }

    // Duplicate detection (folded into the map pass)
    const key = `${patched.name.toLowerCase().trim()}::${patched.floor}`;
    if (seen.has(key)) {
      warnings.push(`Duplicate room: "${patched.name}" on floor ${patched.floor}`);
    }
    seen.add(key);

    return patched;
  });

  // Sqft sum check against building total (or per-unit total for multi-unit)
  const roomSqftSum = rooms.reduce((sum, r) => sum + r.estimated_sqft, 0);
  let confidence = result.confidence;
  if (result.building.total_sqft > 0) {
    const expectedSqft =
      options.perUnitAnalysis && result.building.units > 1
        ? result.building.total_sqft / result.building.units
        : result.building.total_sqft;
    const totalDiff = Math.abs(roomSqftSum - expectedSqft);
    if (totalDiff / expectedSqft > 0.15) {
      confidence = "low";
      warnings.push(
        `Room sqft sum (${roomSqftSum}) differs from ${options.perUnitAnalysis ? "per-unit" : "building"} total (${Math.round(expectedSqft)}) by ${Math.round((totalDiff / expectedSqft) * 100)}%`
      );
    }
  }

  const analysisNotes = [result.analysis_notes, ...warnings]
    .filter(Boolean)
    .join(" | ");

  return {
    ...result,
    rooms,
    confidence,
    analysis_notes: analysisNotes,
  };
}
