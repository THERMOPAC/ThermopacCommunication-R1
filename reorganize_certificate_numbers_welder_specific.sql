-- Reorganize certificate numbers to be welder-specific
-- Each welder will have their own certificate sequence starting from CERT-001

DO $$
DECLARE
    welder_record RECORD;
    cert_record RECORD;
    cert_counter INTEGER;
BEGIN
    -- Process each welder individually
    FOR welder_record IN 
        SELECT DISTINCT welder_id FROM welder_certificates ORDER BY welder_id
    LOOP
        cert_counter := 1;
        
        -- For each welder, renumber their certificates sequentially
        FOR cert_record IN 
            SELECT id FROM welder_certificates 
            WHERE welder_id = welder_record.welder_id 
            ORDER BY id
        LOOP
            UPDATE welder_certificates 
            SET certificate_no = 'CERT-' || LPAD(cert_counter::text, 3, '0')
            WHERE id = cert_record.id;
            
            cert_counter := cert_counter + 1;
        END LOOP;
        
        RAISE NOTICE 'Renumbered certificates for welder ID %: % certificates', 
            welder_record.welder_id, cert_counter - 1;
    END LOOP;
    
    RAISE NOTICE 'Certificate renumbering completed - each welder now has their own sequence';
END $$;

-- Verify the results
SELECT 
    welder_id,
    certificate_no,
    COUNT(*) OVER (PARTITION BY welder_id) as total_certs_for_welder
FROM welder_certificates 
ORDER BY welder_id, certificate_no;