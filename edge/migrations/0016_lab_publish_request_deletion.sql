-- Hide completed applications for both parties without losing publication deduplication.
ALTER TABLE lab_publish_requests ADD COLUMN deleted_at INTEGER;
