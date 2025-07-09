-- Legal Management Module Database Schema

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
    id SERIAL PRIMARY KEY,
    contract_number VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    contract_type VARCHAR(100) NOT NULL, -- Service, Purchase, Employment, NDA, etc.
    party_name VARCHAR(255) NOT NULL,
    party_contact VARCHAR(255),
    party_email VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE,
    renewal_date DATE,
    contract_value DECIMAL(15,2),
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(50) DEFAULT 'Active', -- Active, Expired, Terminated, Pending
    auto_renewal BOOLEAN DEFAULT false,
    notice_period_days INTEGER DEFAULT 30,
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    created_by INTEGER REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Legal Cases table
CREATE TABLE IF NOT EXISTS legal_cases (
    id SERIAL PRIMARY KEY,
    case_number VARCHAR(255) UNIQUE NOT NULL,
    case_title VARCHAR(500) NOT NULL,
    case_type VARCHAR(100) NOT NULL, -- Civil, Criminal, Employment, IP, Contract, Regulatory
    case_status VARCHAR(50) DEFAULT 'Active', -- Active, Closed, Pending, On Hold
    court_name VARCHAR(255),
    judge_name VARCHAR(255),
    opposing_party VARCHAR(255),
    case_value DECIMAL(15,2),
    currency VARCHAR(10) DEFAULT 'INR',
    filing_date DATE,
    next_hearing_date DATE,
    expected_closure_date DATE,
    priority VARCHAR(20) DEFAULT 'Medium', -- High, Medium, Low
    description TEXT,
    outcome TEXT,
    internal_counsel INTEGER REFERENCES users(id),
    external_counsel_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Compliance Register table
CREATE TABLE IF NOT EXISTS compliance_register (
    id SERIAL PRIMARY KEY,
    compliance_type VARCHAR(100) NOT NULL, -- Legal, Regulatory, Statutory, Environmental
    regulation_name VARCHAR(255) NOT NULL,
    applicable_section VARCHAR(255),
    compliance_requirement TEXT NOT NULL,
    frequency VARCHAR(50) NOT NULL, -- Monthly, Quarterly, Half-yearly, Yearly, One-time
    due_date DATE NOT NULL,
    completion_date DATE,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Completed, Overdue, N/A
    responsible_person INTEGER REFERENCES users(id),
    compliance_evidence TEXT,
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    penalty_amount DECIMAL(15,2),
    remarks TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- POSH Cases table
CREATE TABLE IF NOT EXISTS posh_cases (
    id SERIAL PRIMARY KEY,
    case_number VARCHAR(255) UNIQUE NOT NULL,
    complaint_date DATE NOT NULL,
    complainant_name VARCHAR(255) NOT NULL,
    complainant_designation VARCHAR(255),
    complainant_department VARCHAR(255),
    respondent_name VARCHAR(255) NOT NULL,
    respondent_designation VARCHAR(255),
    respondent_department VARCHAR(255),
    incident_date DATE,
    incident_location VARCHAR(255),
    case_type VARCHAR(100) NOT NULL, -- Sexual Harassment, Discrimination, Retaliation
    case_status VARCHAR(50) DEFAULT 'Investigation', -- Investigation, Inquiry, Closed, Dismissed
    priority VARCHAR(20) DEFAULT 'High', -- High, Medium, Low
    description TEXT NOT NULL,
    action_taken TEXT,
    outcome VARCHAR(100),
    closure_date DATE,
    committee_members TEXT, -- JSON array of committee member IDs
    investigation_officer INTEGER REFERENCES users(id),
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    confidentiality_level VARCHAR(50) DEFAULT 'Confidential',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Legal Notices table
CREATE TABLE IF NOT EXISTS legal_notices (
    id SERIAL PRIMARY KEY,
    notice_number VARCHAR(255) UNIQUE NOT NULL,
    notice_type VARCHAR(100) NOT NULL, -- Received, Sent, Show Cause, Demand, Termination
    from_party VARCHAR(255) NOT NULL,
    to_party VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    notice_date DATE NOT NULL,
    response_due_date DATE,
    response_date DATE,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Responded, Closed, Escalated
    priority VARCHAR(20) DEFAULT 'Medium', -- High, Medium, Low
    description TEXT NOT NULL,
    response_summary TEXT,
    action_required TEXT,
    assigned_to INTEGER REFERENCES users(id),
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- External Counsel Directory table
CREATE TABLE IF NOT EXISTS external_counsel (
    id SERIAL PRIMARY KEY,
    firm_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    specialization VARCHAR(255), -- Corporate, Litigation, IP, Employment, Tax
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    bar_council_number VARCHAR(100),
    years_experience INTEGER,
    hourly_rate DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    status VARCHAR(50) DEFAULT 'Active', -- Active, Inactive, Blacklisted
    retainer_agreement BOOLEAN DEFAULT false,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Policy Templates table
CREATE TABLE IF NOT EXISTS policy_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(255) NOT NULL,
    template_type VARCHAR(100) NOT NULL, -- HR, Legal, Compliance, Safety, IT
    category VARCHAR(100), -- Employment, Privacy, Code of Conduct, etc.
    version VARCHAR(50) NOT NULL,
    effective_date DATE NOT NULL,
    review_date DATE,
    approval_status VARCHAR(50) DEFAULT 'Draft', -- Draft, Under Review, Approved, Archived
    approved_by INTEGER REFERENCES users(id),
    approval_date DATE,
    template_content TEXT NOT NULL,
    file_path VARCHAR(500),
    file_url VARCHAR(500),
    applicable_locations TEXT, -- JSON array of locations
    mandatory BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Legal Alerts table
CREATE TABLE IF NOT EXISTS legal_alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(100) NOT NULL, -- Contract Expiry, Hearing Date, Compliance Due, Notice Response
    reference_type VARCHAR(100) NOT NULL, -- contracts, legal_cases, compliance_register, legal_notices
    reference_id INTEGER NOT NULL,
    alert_date DATE NOT NULL,
    alert_title VARCHAR(255) NOT NULL,
    alert_message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Active', -- Active, Dismissed, Resolved
    priority VARCHAR(20) DEFAULT 'Medium', -- High, Medium, Low
    assigned_to INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON contracts(created_by);
CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(case_status);
CREATE INDEX IF NOT EXISTS idx_legal_cases_next_hearing ON legal_cases(next_hearing_date);
CREATE INDEX IF NOT EXISTS idx_compliance_due_date ON compliance_register(due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_register(status);
CREATE INDEX IF NOT EXISTS idx_posh_cases_status ON posh_cases(case_status);
CREATE INDEX IF NOT EXISTS idx_legal_notices_status ON legal_notices(status);
CREATE INDEX IF NOT EXISTS idx_legal_notices_due_date ON legal_notices(response_due_date);
CREATE INDEX IF NOT EXISTS idx_legal_alerts_status ON legal_alerts(status);
CREATE INDEX IF NOT EXISTS idx_legal_alerts_date ON legal_alerts(alert_date);