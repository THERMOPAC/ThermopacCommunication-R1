#!/bin/bash

# Run the migration script
echo "Running master items database migration script..."
tsx scripts/db-migrate-master-items.ts

echo "Migration completed!"