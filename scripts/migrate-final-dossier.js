#!/usr/bin/env node

/**
 * Final Dossier Migration Script
 * 
 * This script migrates all Final Dossier files from the old path structure
 * (QMS/Inspections_Records/{project}/{inspection}/Final Dossier/)
 * to the new path structure  
 * (QMS/Inspections_Records/{project}/{inspection}/Final_Dossier/)
 * 
 * Usage:
 *   node scripts/migrate-final-dossier.js [--check-only] [--dry-run]
 * 
 * Options:
 *   --check-only    Only check migration status, don't execute migration
 *   --dry-run      Show what would be migrated without actually doing it
 */

const { spawn } = require('child_process');
const path = require('path');

async function runMigration(checkOnly = false, dryRun = false) {
  console.log('🚀 Final Dossier Migration Tool');
  console.log('=================================');
  
  if (checkOnly) {
    console.log('📊 Running migration status check...');
    
    // Run the check migration status endpoint
    const curl = spawn('curl', [
      '-X', 'GET',
      'http://localhost:5000/api/quality/final-dossier/migration/status',
      '-H', 'Content-Type: application/json'
    ]);
    
    curl.stdout.on('data', (data) => {
      try {
        const result = JSON.parse(data.toString());
        console.log('\n📋 Migration Status Report:');
        console.log(`Total checked: ${result.totalChecked}`);
        console.log(`Need migration: ${result.needsMigration}`);
        console.log(`Already migrated: ${result.alreadyMigrated}`);
        
        if (result.results && result.results.length > 0) {
          console.log('\n📁 Details:');
          result.results.forEach(r => {
            console.log(`  ${r.inspectionOrderNumber}: ${r.oldFilesCount} old files, ${r.newFilesCount} new files ${r.needsMigration ? '(needs migration)' : '(ok)'}`);
          });
        }
      } catch (e) {
        console.log('Response:', data.toString());
      }
    });
    
    curl.stderr.on('data', (data) => {
      console.error('Error:', data.toString());
    });
    
    curl.on('close', (code) => {
      console.log(`\n✅ Migration status check completed (exit code ${code})`);
    });
    
  } else if (dryRun) {
    console.log('🧪 DRY RUN MODE - No files will be moved');
    console.log('This would execute the migration but only show what would happen.');
    
  } else {
    console.log('⚠️  WARNING: This will migrate all Final Dossier files from old to new path structure!');
    console.log('📂 Old: QMS/Inspections_Records/{project}/{inspection}/Final Dossier/');
    console.log('📂 New: QMS/Inspections_Records/{project}/{inspection}/Final_Dossier/');
    console.log('\n🔄 Executing migration...');
    
    // Run the execute migration endpoint
    const curl = spawn('curl', [
      '-X', 'POST',
      'http://localhost:5000/api/quality/final-dossier/migration/execute',
      '-H', 'Content-Type: application/json'
    ]);
    
    curl.stdout.on('data', (data) => {
      try {
        const result = JSON.parse(data.toString());
        if (result.success) {
          const summary = result.summary;
          console.log('\n📊 Migration Summary:');
          console.log(`✅ Total inspection orders: ${summary.totalInspectionOrders}`);
          console.log(`✅ Successful migrations: ${summary.successfulMigrations}`);
          console.log(`❌ Failed migrations: ${summary.failedMigrations}`);
          console.log(`📄 Total files migrated: ${summary.totalFilesMigrated}`);
          
          if (summary.errors && summary.errors.length > 0) {
            console.log('\n❌ Errors:');
            summary.errors.forEach(error => console.log(`  - ${error}`));
          }
          
          if (summary.details && summary.details.length > 0) {
            console.log('\n📁 Migration Details:');
            summary.details.forEach(detail => {
              const status = detail.success ? '✅' : '❌';
              console.log(`  ${status} ${detail.inspectionOrderNumber}: ${detail.migratedFiles.length} files migrated`);
              if (detail.errors.length > 0) {
                detail.errors.forEach(error => console.log(`    ⚠️  ${error}`));
              }
            });
          }
        } else {
          console.log('❌ Migration failed:', data.toString());
        }
      } catch (e) {
        console.log('Response:', data.toString());
      }
    });
    
    curl.stderr.on('data', (data) => {
      console.error('Error:', data.toString());
    });
    
    curl.on('close', (code) => {
      console.log(`\n🏁 Migration completed (exit code ${code})`);
    });
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const dryRun = args.includes('--dry-run');

if (args.includes('--help') || args.includes('-h')) {
  console.log('Final Dossier Migration Tool');
  console.log('Usage: node scripts/migrate-final-dossier.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --check-only    Only check migration status');
  console.log('  --dry-run      Show what would be migrated (not implemented yet)');
  console.log('  --help, -h     Show this help message');
  process.exit(0);
}

// Run the migration
runMigration(checkOnly, dryRun).catch(console.error);