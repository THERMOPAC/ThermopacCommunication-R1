-- After-Sales Module Tables

-- Table for customer service requests
CREATE TABLE service_requests (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  project_id INTEGER REFERENCES projects(id),
  request_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
  status VARCHAR(20) NOT NULL DEFAULT 'New',
  created_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for service activities (site visits, repairs, etc.)
CREATE TABLE service_activities (
  id SERIAL PRIMARY KEY,
  service_request_id INTEGER NOT NULL REFERENCES service_requests(id),
  activity_type VARCHAR(50) NOT NULL,
  scheduled_date DATE,
  actual_date DATE,
  description TEXT,
  outcome TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
  performed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for service parts used
CREATE TABLE service_parts (
  id SERIAL PRIMARY KEY,
  service_activity_id INTEGER NOT NULL REFERENCES service_activities(id),
  item_id INTEGER NOT NULL REFERENCES master_items(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2),
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for customer follow-ups
CREATE TABLE customer_followups (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  followup_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  outcome TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
  created_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for business opportunities
CREATE TABLE business_opportunities (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  opportunity_name VARCHAR(255) NOT NULL,
  description TEXT,
  estimated_value DECIMAL(12, 2),
  probability INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'New',
  expected_close_date DATE,
  actual_close_date DATE,
  outcome VARCHAR(50),
  created_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for service contracts
CREATE TABLE service_contracts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  project_id INTEGER REFERENCES projects(id),
  contract_number VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  contract_value DECIMAL(12, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for contract services (maintenance visits, support hours, etc.)
CREATE TABLE contract_services (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES service_contracts(id),
  service_type VARCHAR(50) NOT NULL,
  frequency VARCHAR(50),
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for contract service delivery
CREATE TABLE contract_deliveries (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES service_contracts(id),
  service_id INTEGER NOT NULL REFERENCES contract_services(id),
  scheduled_date DATE NOT NULL,
  actual_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
  notes TEXT,
  performed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);