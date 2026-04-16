-- Rename model_number → mpn on equipment_catalog to align with industry
-- terminology (Manufacturer Part Number). quote_lines.model_number is
-- intentionally left unchanged — it represents raw text from parsed quotes.
ALTER TABLE equipment_catalog RENAME COLUMN model_number TO mpn;
