-- Work Order History Table
-- For tracking all changes made to work orders

CREATE TABLE IF NOT EXISTS work_order_history (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  
  -- Who made the change
  user_id INTEGER NOT NULL REFERENCES users(id),
  username TEXT NOT NULL, -- Denormalized for history records
  
  -- What changed
  change_type TEXT NOT NULL, -- 'created', 'updated', 'status_change', 'comment', etc.
  field_name TEXT, -- Which field was changed (if applicable)
  old_value TEXT, -- Previous value (serialized if needed)
  new_value TEXT, -- New value (serialized if needed)
  
  -- Change details
  change_description TEXT NOT NULL, -- Human-readable description of what changed
  comment TEXT, -- Optional comment added by the user
  
  -- When it happened
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups by work order
CREATE INDEX IF NOT EXISTS work_order_history_work_order_id_idx ON work_order_history(work_order_id);

-- Create index for timestamps to sort history chronologically
CREATE INDEX IF NOT EXISTS work_order_history_created_at_idx ON work_order_history(created_at);