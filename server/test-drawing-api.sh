#!/bin/bash

# Simple script to test the drawings API endpoint
# Usage: ./test-drawing-api.sh [drawing-number]

# Default drawing number
DRAWING_NO=${1:-4906001001001000}

# Get a session cookie first (requires valid username/password)
echo "Logging in to get session cookie..."
curl -s -c cookies.txt -X POST -H "Content-Type: application/json" \
     -d '{"username":"Superuser","password":"password"}' \
     http://localhost:5000/api/login

# Test the drawings API endpoint
echo -e "\nTesting drawings API for drawing number: $DRAWING_NO"
curl -s -b cookies.txt "http://localhost:5000/api/storage/drawings?drawingNo=$DRAWING_NO" | jq .

# Clean up
rm cookies.txt
echo -e "\nTest completed!"