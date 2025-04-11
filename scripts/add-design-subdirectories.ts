/**
 * This script adds additional subdirectories to the Design folder for all projects
 */

import { db } from '../server/db';

// Additional subdirectories for Design folder
const additionalDesignSubdirectories = [
  '0_3D_Model_Assembly',  // Already added previously
  '1_BEDD',               // Already added previously
  '2_Relevant_Standards', // Already added previously
  '2_P_ID',               // Already added previously
  '4_Material_and_heat_balance', // Already added previously
  '4_Hazop',              // Already added previously
  '5_QAP',                // Already added previously
  '6_Tiein_points',       // Already added previously
  '7_GA',                 // Already added previously
  '8_Foundation',         // Already added previously
  '9_Electrical',         // Already added previously
  
  // New additional subdirectories requested
  '10_Progress_Report',
  '11_Cause_Effect',
  '12_Data_sheet_for_approval',
  '13_Inspection_Reports',
  '14_Design_Calculation',
  '15_Operation_Maintenance_Manual'
];

// Initialize directory structure for existing projects
async function addDesignSubdirectories() {
  try {
    // Get all project codes from the database
    const projects = await db.query.projects.findMany({
      columns: {
        code: true,
        financial_year: true
      }
    });

    console.log(`Found ${projects.length} projects to add design subdirectories for`);

    for (const project of projects) {
      const department = 'Design';
      
      // Add the additional subdirectories to the Design folder
      for (const subDir of additionalDesignSubdirectories) {
        await createDirectoryInDb(project.financial_year, project.code, department, subDir);
      }
      
      console.log(`✓ Added design subdirectories for project ${project.code}`);
    }

    console.log('Design subdirectory addition complete!');
  } catch (error) {
    console.error('Error adding design subdirectories:', error);
  }
}

async function createDirectoryInDb(financialYear: string, projectCode: string, department: string, subDirectory: string | null) {
  try {
    const basePath = `${financialYear}/${projectCode}/${department}`;
    const fullPath = subDirectory ? `${basePath}/${subDirectory}` : basePath;

    // Check if the directory already exists in the database using raw query
    const { rows } = await db.$client.query(
      'SELECT id FROM gcs_directories WHERE full_path = $1',
      [fullPath]
    );

    if (rows.length === 0) {
      // Insert the new directory using raw query
      await db.$client.query(
        `INSERT INTO gcs_directories 
         (financial_year, project_code, department, sub_directory, full_path, is_public, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [financialYear, projectCode, department, subDirectory, fullPath, false, 3]
      );
      console.log(`Created directory record: ${fullPath}`);
    } else {
      console.log(`Directory record already exists: ${fullPath}`);
    }
  } catch (error) {
    console.error(`Error creating directory record for ${subDirectory}:`, error);
  }
}

// Run the initialization
addDesignSubdirectories()
  .then(() => {
    console.log('Design subdirectory addition completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error adding design subdirectories:', error);
    process.exit(1);
  });