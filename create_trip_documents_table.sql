-- Trip Documents Table for Business Trip Documentation
-- This table stores all documents uploaded for each business trip

CREATE TABLE trip_documents (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES business_trips(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL CHECK (document_type IN (
        'travel_booking',
        'hotel_confirmation', 
        'meeting_invitation',
        'visa_documents',
        'advance_payment_request',
        'correspondence',
        'expense_receipt',
        'trip_report'
    )),
    document_name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL, -- GCS path: FY/{user_id_or_name}/{Destination}/{From Date}/{Document Type}/filename
    file_url TEXT, -- Signed URL for access
    file_size BIGINT, -- File size in bytes
    file_type VARCHAR(100), -- MIME type
    description TEXT,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true -- For soft delete
);

-- Create indexes for performance
CREATE INDEX idx_trip_documents_trip_id ON trip_documents(trip_id);
CREATE INDEX idx_trip_documents_document_type ON trip_documents(document_type);
CREATE INDEX idx_trip_documents_uploaded_by ON trip_documents(uploaded_by);
CREATE INDEX idx_trip_documents_uploaded_at ON trip_documents(uploaded_at);

-- Comment on table
COMMENT ON TABLE trip_documents IS 'Stores all documents uploaded for business trips with structured GCS path format';
COMMENT ON COLUMN trip_documents.file_path IS 'Structured GCS path: FY/{user_id_or_name}/{Destination}/{From Date}/{Document Type}/filename';
COMMENT ON COLUMN trip_documents.document_type IS 'Type of document: travel_booking, hotel_confirmation, meeting_invitation, visa_documents, advance_payment_request, correspondence, expense_receipt, trip_report';