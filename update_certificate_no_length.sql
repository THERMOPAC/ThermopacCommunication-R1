-- Increase the length of the certificate_no field in wpqr_documents table to 100 characters
ALTER TABLE wpqr_documents
ALTER COLUMN certificate_no TYPE VARCHAR(100);