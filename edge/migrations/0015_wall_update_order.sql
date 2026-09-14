-- Published walls keep their last update time when publication is retried.
DROP INDEX IF EXISTS walls_public_order_idx;
CREATE INDEX walls_public_order_idx ON walls(visibility, published, updated_at DESC, id DESC);
