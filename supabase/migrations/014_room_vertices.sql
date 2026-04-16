-- Store the room polygon vertex list as JSONB.
--
-- Vertices are normalized 0-1 image coordinates emitted by the vision-LLM
-- pipeline and further edited by users dragging corners in the estimator UI.
-- Nullable / defaulting to empty array so existing rows survive — UI falls
-- back to rendering from bbox when vertices is empty.

ALTER TABLE estimate_rooms ADD COLUMN vertices JSONB DEFAULT '[]';
