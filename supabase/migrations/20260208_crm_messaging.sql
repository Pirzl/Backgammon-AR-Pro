-- Migration: CRM Bidirectional Messaging System
-- Purpose: Create messages table for Admin <-> User communication with real-time support
-- Created: 2026-02-08
-- Note: This is separate from the existing 'notifications' table to maintain backward compatibility

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 0: Clean up if table exists (for re-running migration)
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop existing publication if it exists
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE messages;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Drop existing table and all dependencies
DROP TABLE IF EXISTS messages CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Create messages table
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),

  -- Read receipts (separate tracking for admin and receiver)
  read_by_receiver boolean DEFAULT false NOT NULL,
  read_by_admin boolean DEFAULT false NOT NULL,

  -- Message metadata
  is_admin_message boolean DEFAULT false NOT NULL,
  is_broadcast boolean DEFAULT false NOT NULL,

  -- Constraints
  CONSTRAINT messages_content_not_empty CHECK (length(trim(content)) > 0),
  CONSTRAINT messages_different_users CHECK (sender_id != receiver_id)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Create indexes for performance
-- ══════════════════════════════════════════════════════════════════════════════

-- Index for finding unread messages for a specific receiver
CREATE INDEX messages_receiver_unread_idx
  ON messages (receiver_id, created_at DESC)
  WHERE read_by_receiver = false;

-- Index for finding unread messages from users to admin
CREATE INDEX messages_admin_unread_idx
  ON messages (receiver_id, created_at DESC)
  WHERE read_by_admin = false;

-- Index for conversation queries (both directions)
CREATE INDEX messages_conversation_idx
  ON messages (sender_id, receiver_id, created_at DESC);

-- Index for finding all messages for a user (sent or received)
CREATE INDEX messages_user_all_idx
  ON messages (created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Enable Realtime
-- ══════════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Enable Row Level Security
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 5: RLS Policies
-- ══════════════════════════════════════════════════════════════════════════════

-- Policy 1: Users can send messages ONLY to admin users
-- This prevents user-to-user messaging
CREATE POLICY "users_can_send_to_admin"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  -- User is sending their own message
  auth.uid() = sender_id
  AND
  -- Receiver must be an admin
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = receiver_id
    AND profiles.role = 'admin'
  )
);

-- Policy 2: Users can read their own messages (sent or received)
-- They can only see conversations they are part of
CREATE POLICY "users_can_read_own_messages"
ON messages FOR SELECT
TO authenticated
USING (
  auth.uid() = sender_id
  OR auth.uid() = receiver_id
);

-- Policy 3: Admin can read ALL messages
-- Admins need to see all conversations to support users
CREATE POLICY "admin_can_read_all"
ON messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy 4: Admin can send messages to ANY user
CREATE POLICY "admin_can_send_messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
  AND auth.uid() = sender_id
);

-- Policy 5: Admin can update read flags on messages
-- This allows marking messages as read
CREATE POLICY "admin_can_update_messages"
ON messages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy 6: Users can update ONLY their own read receipt
-- Users can mark messages as read when they are the receiver
CREATE POLICY "users_can_update_own_read_receipt"
ON messages FOR UPDATE
TO authenticated
USING (
  auth.uid() = receiver_id
)
WITH CHECK (
  auth.uid() = receiver_id
);

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Add helpful comments
-- ══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE messages IS 'Bidirectional messaging between admin and users for CRM support';
COMMENT ON COLUMN messages.read_by_receiver IS 'True when the receiver (user or admin) has read the message';
COMMENT ON COLUMN messages.read_by_admin IS 'True when admin has read a user message (for admin inbox management)';
COMMENT ON COLUMN messages.is_admin_message IS 'True if sent by admin to user';
COMMENT ON COLUMN messages.is_broadcast IS 'True if admin sent to multiple users at once';

-- ══════════════════════════════════════════════════════════════════════════════
-- SUCCESS MESSAGE
-- ══════════════════════════════════════════════════════════════════════════════

-- The migration completed successfully! 
-- You can now use the bidirectional messaging system.
