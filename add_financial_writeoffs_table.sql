-- Create the write_offs table for tracking financial write-offs
CREATE TABLE write_offs (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('Invoice', 'Payment')),
  source_id INTEGER NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Approved' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  approved_by INTEGER,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  gl_account VARCHAR(50),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Add indexes for better query performance
CREATE INDEX idx_write_offs_source ON write_offs(source_type, source_id);
CREATE INDEX idx_write_offs_created_by ON write_offs(created_by);
CREATE INDEX idx_write_offs_status ON write_offs(status);

-- Add a constraint to ensure the amount is positive
ALTER TABLE write_offs ADD CONSTRAINT check_positive_writeoff CHECK (amount > 0);

-- Add a comment to describe the table
COMMENT ON TABLE write_offs IS 'Tracks financial write-offs for invoices and payments';