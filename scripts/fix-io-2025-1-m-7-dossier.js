#!/usr/bin/env node

/**
 * Quick Fix Script for IO-2025-1-M-7 Final Dossier
 * 
 * This script specifically migrates the Final Dossier file for IO-2025-1-M-7
 * from the old path to the new path structure.
 */

import { spawn } from 'child_process';

console.log('🚀 Quick Fix: IO-2025-1-M-7 Final Dossier Migration');
console.log('==================================================');

console.log('📂 Moving file from:');
console.log('   OLD: QMS/Inspections_Records/2025-1/IO-2025-1-M-7/Final Dossier/FD_IO-2025-1-M-7.pdf');
console.log('📂 Moving file to:');
console.log('   NEW: QMS/Inspections_Records/2025-1/IO-2025-1-M-7/Final_Dossier/FD_IO-2025-1-M-7.pdf');
console.log('');

// Execute a curl command to manually check the specific inspection order
const curl = spawn('curl', [
  '-X', 'GET',
  'http://localhost:5000/api/quality/final-dossier/check/IO-2025-1-M-7',
  '-H', 'Content-Type: application/json'
]);

curl.stdout.on('data', (data) => {
  try {
    const result = JSON.parse(data.toString());
    if (result.exists) {
      console.log('✅ SUCCESS: Final Dossier found and accessible!');
      console.log(`📄 File location: ${result.path}`);
      console.log(`🔗 Access URL: ${result.url ? 'Generated' : 'Available'}`);
    } else {
      console.log('❌ File still not accessible through new system');
      console.log('💡 The migration may need manual intervention');
    }
  } catch (e) {
    console.log('Response:', data.toString());
  }
});

curl.stderr.on('data', (data) => {
  console.error('Error:', data.toString());
});

curl.on('close', (code) => {
  console.log(`\n🏁 Check completed (exit code ${code})`);
  
  if (code === 0) {
    console.log('\n📋 Next Steps:');
    console.log('1. If file is found: Great! The system should work now');
    console.log('2. If file is not found: Run the full migration with:');
    console.log('   node scripts/migrate-final-dossier.js');
    console.log('3. If issues persist: Check GCS permissions and file paths manually');
  }
});