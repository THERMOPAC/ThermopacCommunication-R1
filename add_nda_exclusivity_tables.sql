-- Create NDA and Exclusivity Agreement Tables

-- NDA (Non-Disclosure Agreement) Management
CREATE TABLE IF NOT EXISTS nda_agreements (
    id SERIAL PRIMARY KEY,
    agreement_number VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    party_name VARCHAR(255) NOT NULL,
    party_type VARCHAR(50) NOT NULL, -- Individual, Company, Vendor, Client, Employee
    party_contact VARCHAR(255),
    party_email VARCHAR(255),
    nda_type VARCHAR(50) NOT NULL, -- Unilateral, Mutual, Multilateral
    disclosure_scope TEXT NOT NULL,
    purpose TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    duration_months INTEGER,
    confidentiality_level VARCHAR(50) DEFAULT 'Standard', -- Standard, High, Critical
    permitted_use TEXT,
    exceptions TEXT,
    return_obligation BOOLEAN DEFAULT true,
    monetary_damages DECIMAL(15, 2),
    currency VARCHAR(10) DEFAULT 'INR',
    governing_law VARCHAR(100) DEFAULT 'Indian Law',
    jurisdiction VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Active', -- Active, Expired, Terminated, Breached
    breach_incidents INTEGER DEFAULT 0,
    auto_renewal BOOLEAN DEFAULT false,
    notice_period_days INTEGER DEFAULT 30,
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    digital_signature_required BOOLEAN DEFAULT false,
    signed_date DATE,
    witness_required BOOLEAN DEFAULT false,
    witness_name VARCHAR(255),
    witness_contact VARCHAR(255),
    created_by INTEGER REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Exclusivity Agreement Management
CREATE TABLE IF NOT EXISTS exclusivity_agreements (
    id SERIAL PRIMARY KEY,
    agreement_number VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    party_name VARCHAR(255) NOT NULL,
    party_type VARCHAR(50) NOT NULL, -- Vendor, Supplier, Distributor, Client, Partner
    party_contact VARCHAR(255),
    party_email VARCHAR(255),
    exclusivity_type VARCHAR(50) NOT NULL, -- Geographic, Product, Service, Territory, Time-based
    exclusivity_scope TEXT NOT NULL,
    geographical_scope TEXT,
    product_service_scope TEXT,
    territory_restrictions TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    duration_months INTEGER,
    minimum_commitment DECIMAL(15, 2),
    performance_targets TEXT,
    penalty_clause TEXT,
    termination_conditions TEXT,
    renewal_terms TEXT,
    exclusivity_level VARCHAR(50) DEFAULT 'Full', -- Full, Partial, Conditional
    competing_restrictions TEXT,
    non_compete_period INTEGER, -- months after termination
    agreement_value DECIMAL(15, 2),
    currency VARCHAR(10) DEFAULT 'INR',
    payment_terms TEXT,
    milestone_requirements TEXT,
    governing_law VARCHAR(100) DEFAULT 'Indian Law',
    jurisdiction VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Active', -- Active, Expired, Terminated, Breached, Suspended
    breach_incidents INTEGER DEFAULT 0,
    performance_score INTEGER DEFAULT 0, -- 0-100 scale
    auto_renewal BOOLEAN DEFAULT false,
    notice_period_days INTEGER DEFAULT 60,
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    digital_signature_required BOOLEAN DEFAULT false,
    signed_date DATE,
    witness_required BOOLEAN DEFAULT false,
    witness_name VARCHAR(255),
    witness_contact VARCHAR(255),
    created_by INTEGER REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- NDA Breach Incidents Tracking
CREATE TABLE IF NOT EXISTS nda_breach_incidents (
    id SERIAL PRIMARY KEY,
    nda_id INTEGER REFERENCES nda_agreements(id) ON DELETE CASCADE,
    incident_number VARCHAR(255) UNIQUE NOT NULL,
    incident_date DATE NOT NULL,
    incident_type VARCHAR(100) NOT NULL, -- Unauthorized Disclosure, Misuse, Data Leak, Violation
    severity VARCHAR(50) NOT NULL, -- Minor, Moderate, Major, Critical
    description TEXT NOT NULL,
    discovered_by VARCHAR(255),
    discovery_date DATE,
    investigation_status VARCHAR(50) DEFAULT 'Open', -- Open, Under Investigation, Resolved, Closed
    investigation_findings TEXT,
    remedial_actions TEXT,
    legal_action_taken BOOLEAN DEFAULT false,
    legal_action_details TEXT,
    damages_claimed DECIMAL(15, 2),
    damages_awarded DECIMAL(15, 2),
    currency VARCHAR(10) DEFAULT 'INR',
    resolution_date DATE,
    lessons_learned TEXT,
    preventive_measures TEXT,
    created_by INTEGER REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Exclusivity Performance Tracking
CREATE TABLE IF NOT EXISTS exclusivity_performance (
    id SERIAL PRIMARY KEY,
    exclusivity_id INTEGER REFERENCES exclusivity_agreements(id) ON DELETE CASCADE,
    evaluation_period VARCHAR(50) NOT NULL, -- Monthly, Quarterly, Annual
    evaluation_date DATE NOT NULL,
    target_achievement DECIMAL(5, 2) DEFAULT 0.00, -- Percentage
    revenue_generated DECIMAL(15, 2) DEFAULT 0.00,
    volume_achieved DECIMAL(15, 2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'INR',
    performance_rating VARCHAR(50), -- Excellent, Good, Average, Poor
    performance_score INTEGER DEFAULT 0, -- 0-100 scale
    compliance_score INTEGER DEFAULT 0, -- 0-100 scale
    feedback_comments TEXT,
    improvement_areas TEXT,
    recognition_rewards TEXT,
    penalty_applied BOOLEAN DEFAULT false,
    penalty_amount DECIMAL(15, 2),
    penalty_reason TEXT,
    next_evaluation_date DATE,
    created_by INTEGER REFERENCES users(id),
    evaluated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Agreement Renewals and Amendments Tracking
CREATE TABLE IF NOT EXISTS agreement_amendments (
    id SERIAL PRIMARY KEY,
    agreement_type VARCHAR(50) NOT NULL, -- NDA, Exclusivity, Contract
    agreement_id INTEGER NOT NULL,
    amendment_number VARCHAR(255) NOT NULL,
    amendment_date DATE NOT NULL,
    amendment_type VARCHAR(100) NOT NULL, -- Extension, Modification, Termination, Renewal
    previous_terms TEXT,
    new_terms TEXT,
    changes_summary TEXT NOT NULL,
    reason_for_change TEXT,
    effective_date DATE,
    approval_required BOOLEAN DEFAULT true,
    approval_status VARCHAR(50) DEFAULT 'Pending', -- Pending, Approved, Rejected
    approved_by INTEGER REFERENCES users(id),
    approval_date DATE,
    legal_review_required BOOLEAN DEFAULT true,
    legal_review_status VARCHAR(50) DEFAULT 'Pending',
    legal_reviewer INTEGER REFERENCES users(id),
    legal_review_date DATE,
    legal_review_comments TEXT,
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_nda_agreements_status ON nda_agreements(status);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_party_type ON nda_agreements(party_type);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_end_date ON nda_agreements(end_date);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_created_by ON nda_agreements(created_by);
CREATE INDEX IF NOT EXISTS idx_nda_agreements_assigned_to ON nda_agreements(assigned_to);

CREATE INDEX IF NOT EXISTS idx_exclusivity_agreements_status ON exclusivity_agreements(status);
CREATE INDEX IF NOT EXISTS idx_exclusivity_agreements_party_type ON exclusivity_agreements(party_type);
CREATE INDEX IF NOT EXISTS idx_exclusivity_agreements_end_date ON exclusivity_agreements(end_date);
CREATE INDEX IF NOT EXISTS idx_exclusivity_agreements_created_by ON exclusivity_agreements(created_by);
CREATE INDEX IF NOT EXISTS idx_exclusivity_agreements_assigned_to ON exclusivity_agreements(assigned_to);

CREATE INDEX IF NOT EXISTS idx_nda_breach_incidents_nda_id ON nda_breach_incidents(nda_id);
CREATE INDEX IF NOT EXISTS idx_nda_breach_incidents_severity ON nda_breach_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_nda_breach_incidents_status ON nda_breach_incidents(investigation_status);

CREATE INDEX IF NOT EXISTS idx_exclusivity_performance_exclusivity_id ON exclusivity_performance(exclusivity_id);
CREATE INDEX IF NOT EXISTS idx_exclusivity_performance_evaluation_date ON exclusivity_performance(evaluation_date);
CREATE INDEX IF NOT EXISTS idx_exclusivity_performance_score ON exclusivity_performance(performance_score);

CREATE INDEX IF NOT EXISTS idx_agreement_amendments_agreement_type ON agreement_amendments(agreement_type);
CREATE INDEX IF NOT EXISTS idx_agreement_amendments_agreement_id ON agreement_amendments(agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_amendments_status ON agreement_amendments(approval_status);