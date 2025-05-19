-- Add financial write-offs table
CREATE TABLE IF NOT EXISTS write_offs (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  date_created TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Pending',
  approved_by INTEGER REFERENCES users(id),
  approval_date TIMESTAMP
);