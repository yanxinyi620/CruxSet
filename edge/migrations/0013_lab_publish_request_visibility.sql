-- Keep direct publication receipts for idempotency, outside the review list.
ALTER TABLE lab_publish_requests ADD COLUMN requires_review INTEGER NOT NULL DEFAULT 1 CHECK(requires_review IN (0,1));

-- The previous admin direct-publish path recorded the administrator as both
-- applicant and reviewer. Creator applications reviewed by admins stay visible.
UPDATE lab_publish_requests
SET requires_review=0
WHERE applicant_id=reviewer_id
  AND applicant_id IN (SELECT user_id FROM admins WHERE role='admin');
