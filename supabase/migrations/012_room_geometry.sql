-- Add spatial columns for room geometry extracted by the floor plan geometry service.
-- Columns are nullable at DB level so existing rows survive. Application code
-- enforces required-ness for new estimates via Zod schema.

ALTER TABLE estimate_rooms ADD COLUMN bbox_x         NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_y         NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_width     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN bbox_height    NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN centroid_x     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN centroid_y     NUMERIC;
ALTER TABLE estimate_rooms ADD COLUMN adjacent_rooms TEXT[] DEFAULT '{}';
