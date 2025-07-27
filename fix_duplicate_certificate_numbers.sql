-- Fix duplicate certificate numbers by assigning unique sequential numbers
-- This script will renumber all existing certificates with proper unique IDs

-- Start with CERT-002 since we want to preserve any existing CERT-001 as the first certificate
-- Create a temporary sequence counter starting from 2
DO $$
DECLARE
    cert_record RECORD;
    next_id INTEGER := 2;
BEGIN
    -- Update all certificates except the first CERT-001 (keep one as CERT-001)
    -- Order by ID to maintain chronological consistency
    FOR cert_record IN 
        SELECT id FROM welder_certificates 
        WHERE certificate_no = 'CERT-001' 
        ORDER BY id 
        OFFSET 1  -- Skip the first CERT-001
    LOOP
        UPDATE welder_certificates 
        SET certificate_no = 'CERT-' || LPAD(next_id::text, 3, '0')
        WHERE id = cert_record.id;
        
        next_id := next_id + 1;
    END LOOP;
    
    -- Update CERT-000 to proper sequence number
    UPDATE welder_certificates 
    SET certificate_no = 'CERT-' || LPAD(next_id::text, 3, '0')
    WHERE certificate_no = 'CERT-000';
    
    RAISE NOTICE 'Certificate renumbering completed. Next available ID: CERT-%', LPAD((next_id + 1)::text, 3, '0');
END $$;

-- Verify the results
SELECT 'After fix:' as status, certificate_no, COUNT(*) as count 
FROM welder_certificates 
GROUP BY certificate_no 
ORDER BY certificate_no;