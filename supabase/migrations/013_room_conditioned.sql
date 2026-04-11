-- Add conditioned flag to rooms. Defaults to true so existing rows
-- (which were all conditioned spaces) keep working. Garages and outdoor
-- spaces will be saved with conditioned = false going forward.

ALTER TABLE estimate_rooms ADD COLUMN conditioned BOOLEAN DEFAULT true;
