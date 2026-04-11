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

    // Duplicate detection — include unit in key so same room name in different units is OK
    const unitKey = patched.unit ?? 0;
    const key = `${patched.name.toLowerCase().trim()}::${patched.floor}::${unitKey}`;
    if (seen.has(key)) {
      warnings.push(`Duplicate room: "${patched.name}" on floor ${patched.floor}${patched.unit ? ` unit ${patched.unit}` : ""}`);
    }
    seen.add(key);

    return patched;
  });

  // Geometry validation: every room must have spatial data
  for (const room of rooms) {
    if (!room.polygon_id) {
      warnings.push(`Room "${room.name}": missing polygon_id — geometry extraction may have failed`);
    }
    if (!room.bbox || room.bbox.width <= 0 || room.bbox.height <= 0) {
      warnings.push(`Room "${room.name}": invalid or missing bbox`);
    }
  }

  // Check for duplicate polygon_ids
  const polygonIds = rooms.map((r) => r.polygon_id).filter(Boolean);
  const uniquePolygonIds = new Set(polygonIds);
  if (polygonIds.length !== uniquePolygonIds.size) {
    warnings.push("Multiple rooms reference the same polygon_id — geometry/label mismatch");
    confidence = "low";
  }

  // Sqft sum check — per-unit when unit_sqft provided, otherwise building total
  const roomSqftSum = rooms.reduce((sum, r) => sum + r.estimated_sqft, 0);
  let confidence = result.confidence;

  if (result.building.unit_sqft && result.building.unit_sqft.length > 0) {
    // Per-unit validation using explicit unit_sqft array
    for (let u = 0; u < result.building.unit_sqft.length; u++) {
      const unitNum = u + 1;
      const expectedSqft = result.building.unit_sqft[u];
      if (expectedSqft <= 0) continue;

      const unitRoomSum = rooms
        .filter((r) => r.unit === unitNum)
        .reduce((sum, r) => sum + r.estimated_sqft, 0);

      const diff = Math.abs(unitRoomSum - expectedSqft);
      if (diff / expectedSqft > 0.15) {
        confidence = "low";
        warnings.push(
          `Unit ${unitNum} room sqft sum (${unitRoomSum}) differs from expected (${expectedSqft}) by ${Math.round((diff / expectedSqft) * 100)}%`
        );
      }
    }
  } else if (result.building.total_sqft > 0) {
    // Fallback: equal-division or building total
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

  // Per-floor sqft subtotals
  const floorMap = new Map<number, number>();
  for (const room of rooms) {
    floorMap.set(room.floor, (floorMap.get(room.floor) ?? 0) + room.estimated_sqft);
  }
  if (floorMap.size > 1) {
    const floorSummary = [...floorMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([floor, sqft]) => `Floor ${floor}: ${Math.round(sqft)} sqft`)
      .join(", ");
    warnings.push(`Per-floor breakdown: ${floorSummary}`);
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
