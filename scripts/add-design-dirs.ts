/**
 * This script adds additional subdirectories to the Design folder for all projects
 */

import { db } from '../server/db';

// Additional subdirectories for Design folder
const additionalDesignSubdirectories = [
  '10_Progress_Report',
  '11_Cause_Effect',
  '12_Data_sheet_for_approval',
  '13_Inspection_Reports',
  '14_Design_Calculation',
  '15_Operation_Maintenance_Manual'
];

// Function to create directory in database
async function createDirectory(financialYear: string, projectCode: string, subDirectory: string) {
  try {
    const department = 'Design';
    const basePath = `${financialYear}/${projectCode}/${department}`;
    const fullPath = `${basePath}/${subDirectory}`;
    
    // Check if directory already exists
    const { rows } = await db.$client.query(
      'SELECT id FROM gcs_directories WHERE full_path = $1',
      [fullPath]
    );
    
    if (rows.length === 0) {
      // Insert directory
      await db.$client.query(
        `INSERT INTO gcs_directories 
         (financial_year, project_code, department, sub_directory, full_path, is_public, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [financialYear, projectCode, department, subDirectory, fullPath, false, 3]
      );
      console.log(`Created directory: ${fullPath}`);
    } else {
      console.log(`Directory already exists: ${fullPath}`);
    }
  } catch (error) {
    console.error(`Error creating directory ${subDirectory}:`, error);
  }
}

// Main function to add directories
async function addDesignDirs() {
  try {
    // Get all projects
    const { rows: projects } = await db.$client.query(
      'SELECT code, financial_year FROM projects'
    );
    
    console.log(`Found ${projects.length} projects`);
    
    // For each project, add subdirectories
    for (const project of projects) {
      console.log(`Processing project ${project.code}`);
      
      for (const subDir of additionalDesignSubdirectories) {
        await createDirectory(project.financial_year, project.code, subDir);
      }
      
      console.log(`✓ Added design subdirectories for project ${project.code}`);
    }
    
    console.log('All directories added successfully');
  } catch (error) {
    console.error('Error adding directories:', error);
  }
}

// Run the script
addDesignDirs()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });