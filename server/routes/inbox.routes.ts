import { Router, type Request, type Response } from 'express';
import { query } from '../lib/postgres.js';
import { authMiddleware } from '../http/authMiddleware.js';

export const inboxRouter = Router();

inboxRouter.get('/inbox', authMiddleware, async (req: Request, res: Response) => {
  const { rows } = await query<
    {
      thread_id: string;
      last_body: string;
      last_at: Date;
      other_user_id: string;
      other_username: string;
      other_display_name: string;
      other_avatar_url: string;
      unread_count: number;
    }
  >(
    `SELECT tp.thread_id,
            m.body AS last_body,
            m.created_at AS last_at,
            ou.user_id AS other_user_id,
            u.username AS other_username,
            p.display_name AS other_display_name,
            p.avatar_url AS other_avatar_url,
            0::int AS unread_count
       FROM thread_participants tp
       JOIN message_threads t ON t.id = tp.thread_id
       LEFT JOIN LATERAL (
         SELECT body, created_at
           FROM messages
          WHERE thread_id = tp.thread_id
          ORDER BY created_at DESC
          LIMIT 1
       ) m ON TRUE
       JOIN thread_participants ou ON ou.thread_id = tp.thread_id AND ou.user_id <> tp.user_id
       JOIN users u ON u.id = ou.user_id
       JOIN profiles p ON p.user_id = ou.user_id
      WHERE tp.user_id = $1
      ORDER BY m.created_at DESC NULLS LAST`,
    [req.userId],
  );

  const threads = rows.map((row) => ({
    threadId: row.thread_id,
    lastMessage: row.last_body ?? '',
    lastAt: row.last_at ? row.last_at.toISOString() : row.last_at,
    otherUser: {
      id: row.other_user_id,
      username: row.other_username,
      displayName: row.other_display_name,
      avatarUrl: row.other_avatar_url,
    },
    unreadCount: Number(row.unread_count),
  }));

  return res.json({ threads });
});

inboxRouter.get('/inbox/:threadId', authMiddleware, async (req: Request, res: Response) => {
  const threadId = req.params.threadId;
  const participant = await query<{ thread_id: string }>(
    `SELECT thread_id FROM thread_participants WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [threadId, req.userId],
  );

  if (participant.rows.length === 0) {
    return res.status(403).json({ code: 'forbidden', message: 'You are not a participant in this thread.' });
  }

  const { rows } = await query<
    {
      id: string;
      sender_id: string;
      username: string;
      display_name: string;
      avatar_url: string;
      body: string;
      created_at: Date;
    }
  >(
    `SELECT m.id, m.sender_id, u.username, p.display_name, p.avatar_url, m.body, m.created_at
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       JOIN profiles p ON p.user_id = m.sender_id
      WHERE m.thread_id = $1
      ORDER BY m.created_at ASC`,
    [threadId],
  );

  const messages = rows.map((row) => ({
    id: row.id,
    sender: {
      id: row.sender_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
    body: row.body,
    createdAt: row.created_at.toISOString(),
  }));

  return res.json({ threadId, messages });
});

inboxRouter.get('/alerts', authMiddleware, async (req: Request, res: Response) => {
  const { rows } = await query<
    {
      id: string;
      type: string;
      title: string;
      body: string;
      is_read: boolean;
      reference_id: string | null;
      reference_type: string | null;
      created_at: Date;
    }
  >(
    `SELECT id, type, title, body, is_read, reference_id, reference_type, created_at
       FROM user_alerts
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [req.userId],
  );

  const alerts = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    isRead: row.is_read,
    referenceId: row.reference_id,
    referenceType: row.reference_type,
    createdAt: row.created_at.toISOString(),
  }));

  return res.json({ alerts });
});
