-- Business Trip Management Tables
-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS trip_reimbursements CASCADE;
DROP TABLE IF EXISTS trip_expenses CASCADE;
DROP TABLE IF EXISTS trip_bookings CASCADE;
DROP TABLE IF EXISTS trip_approvals CASCADE;
DROP TABLE IF EXISTS business_trips CASCADE;

-- Main business trips table
CREATE TABLE business_trips (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES users(id),
    trip_title VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    destination VARCHAR(255) NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    estimated_travel_cost DECIMAL(10,2) DEFAULT 0,
    estimated_accommodation_cost DECIMAL(10,2) DEFAULT 0,
    estimated_misc_cost DECIMAL(10,2) DEFAULT 0,
    total_estimated_cost DECIMAL(10,2) GENERATED ALWAYS AS (estimated_travel_cost + estimated_accommodation_cost + estimated_misc_cost) STORED,
    advance_requested DECIMAL(10,2) DEFAULT 0,
    supporting_document_url TEXT,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'manager_approved', 'final_approved', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trip approvals table (for workflow tracking)
CREATE TABLE trip_approvals (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES business_trips(id) ON DELETE CASCADE,
    approver_id INTEGER NOT NULL REFERENCES users(id),
    approval_type VARCHAR(50) NOT NULL CHECK (approval_type IN ('manager', 'admin', 'finance')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    comments TEXT,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trip bookings table (admin managed)
CREATE TABLE trip_bookings (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES business_trips(id) ON DELETE CASCADE,
    booking_type VARCHAR(50) NOT NULL CHECK (booking_type IN ('flight', 'hotel', 'transport', 'visa')),
    booking_details TEXT,
    pnr_reference VARCHAR(255),
    hotel_name VARCHAR(255),
    visa_status VARCHAR(100),
    booking_document_url TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trip expenses table (employee submitted post-trip)
CREATE TABLE trip_expenses (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES business_trips(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL CHECK (category IN ('travel', 'meals', 'stay', 'misc')),
    description TEXT,
    amount DECIMAL(10,2) NOT NULL,
    receipt_url TEXT,
    expense_date DATE NOT NULL,
    submitted_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trip reimbursements table (finance processed)
CREATE TABLE trip_reimbursements (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES business_trips(id) ON DELETE CASCADE,
    total_expenses DECIMAL(10,2) NOT NULL,
    advance_given DECIMAL(10,2) DEFAULT 0,
    reimbursement_amount DECIMAL(10,2) GENERATED ALWAYS AS (total_expenses - advance_given) STORED,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'settled')),
    processed_by INTEGER REFERENCES users(id),
    processed_at TIMESTAMP,
    payment_reference VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_business_trips_employee ON business_trips(employee_id);
CREATE INDEX idx_business_trips_status ON business_trips(status);
CREATE INDEX idx_business_trips_dates ON business_trips(from_date, to_date);
CREATE INDEX idx_trip_approvals_trip ON trip_approvals(trip_id);
CREATE INDEX idx_trip_bookings_trip ON trip_bookings(trip_id);
CREATE INDEX idx_trip_expenses_trip ON trip_expenses(trip_id);
CREATE INDEX idx_trip_reimbursements_trip ON trip_reimbursements(trip_id);

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_business_trips_updated_at BEFORE UPDATE ON business_trips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trip_bookings_updated_at BEFORE UPDATE ON trip_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();