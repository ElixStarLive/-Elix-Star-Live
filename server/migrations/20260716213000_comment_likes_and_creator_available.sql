BEGIN;

-- Comment likes used by POST/DELETE /api/videos/:id/comments/:commentId/like
CREATE TABLE IF NOT EXISTS comment_likes (
  user_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, comment_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment
  ON comment_likes(comment_id);

-- Move any legacy gift balances that were stuck in pending into withdrawable available.
UPDATE elix_creator_balances
   SET available_coins = available_coins + pending_coins,
       pending_coins = 0,
       updated_at = NOW()
 WHERE pending_coins > 0;

UPDATE elix_creator_earnings
   SET status = 'available'
 WHERE status = 'pending';

COMMIT;
