/**
 * This script manually creates folders in the database without requiring Google Cloud Storage API
 * Use this to initialize the directory structure for projects
 */

import { db } from '../server/db';

// List of departments used in the system
const departments = ['Design', 'Procurement', 'Manufacturing', 'Quality', 'Sales', 'Engineering', 'General'];

// Common subdirectories
const subDirectories: Record<string, string[]> = {
  'Design': ['Drawings', 'Specifications', 'Models', 'References'],
  'Procurement': ['Purchase_Orders', 'Quotations', 'Vendor_Documents'],
  'Manufacturing': ['Production_Plans', 'Work_Instructions', 'Quality_Checks'],
  'Quality': ['Inspection_Reports', 'Test_Results', 'Certificates'],
  'Sales': ['Pre_Order_Communication', 'Customer_Requirements', 'Contracts'],
  'Engineering': ['Calculations', 'Analysis', 'Technical_Reports'],
  'General': ['Meeting_Minutes', 'Communication', 'Project_Management']
};

// Initialize directory structure for existing projects
async function initializeDirectories() {
  try {
    // Get all project codes from the database
    const projects = await db.query.projects.findMany({
      columns: {
        code: true,
        financial_year: true
      }
    });

    console.log(`Found ${projects.length} projects to initialize directories for`);

    for (const project of projects) {
      for (const department of departments) {
        // Create parent department directory
        const departmentPath = `${project.financial_year}/${project.code}/${department}`;
        await createDirectoryInDb(project.financial_year, project.code, department, null);

        // Create subdirectories for each department
        const deptSubDirs = subDirectories[department] || [];
        for (const subDir of deptSubDirs) {
          await createDirectoryInDb(project.financial_year, project.code, department, subDir);
        }
      }
      console.log(`✓ Created directory structure for project ${project.code}`);
    }

    console.log('Directory initialization complete!');
  } catch (error) {
    console.error('Error initializing directories:', error);
  }
}

async function createDirectoryInDb(financialYear: string, projectCode: string, department: string, subDirectory: string | null) {
  try {
    const basePath = `${financialYear}/${projectCode}/${department}`;
    const fullPath = subDirectory ? `${basePath}/${subDirectory}` : basePath;

    // Check if the directory already exists in the database
    const { rows } = await db.pool.query(
      'SELECT id FROM gcs_directories WHERE full_path = $1',
      [fullPath]
    );

    if (rows.length === 0) {
      await db.pool.query(
        `INSERT INTO gcs_directories 
         (financial_year, project_code, department, sub_directory, full_path, is_public) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [financialYear, projectCode, department, subDirectory, fullPath, false]
      );
      console.log(`Created directory record: ${fullPath}`);
    } else {
      console.log(`Directory record already exists: ${fullPath}`);
    }
  } catch (error) {
    console.error(`Error creating directory record: ${error}`);
  }
}

// Run the initialization
initializeDirectories()
  .then(() => {
    console.log('Directory initialization completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error initializing directories:', error);
    process.exit(1);
  });