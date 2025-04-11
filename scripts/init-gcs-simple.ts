import { db } from '../server/db';
import { Storage } from '@google-cloud/storage';

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac-project-files';
const bucket = storage.bucket(bucketName);

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
        const departmentPath = `${project.financial_year}/${project.code}/${department}/`;
        await createGcsDirectory(departmentPath);

        // Create subdirectories for each department
        const deptSubDirs = subDirectories[department] || [];
        for (const subDir of deptSubDirs) {
          const subDirPath = `${project.financial_year}/${project.code}/${department}/${subDir}/`;
          await createGcsDirectory(subDirPath);
        }
      }
      console.log(`✓ Created directory structure for project ${project.code}`);
    }

    console.log('Directory initialization complete!');
  } catch (error) {
    console.error('Error initializing directories:', error);
  }
}

async function createGcsDirectory(directoryPath: string) {
  try {
    // Creating an empty file with a trailing slash is the GCS way to create a directory
    const file = bucket.file(directoryPath);
    const exists = await file.exists();
    
    if (!exists[0]) {
      await file.save('', { contentType: 'application/x-directory' });
      console.log(`Created GCS directory: ${directoryPath}`);
    } else {
      console.log(`GCS directory already exists: ${directoryPath}`);
    }
  } catch (error) {
    console.error(`Error creating GCS directory ${directoryPath}:`, error);
  }
}

// Run the initialization
initializeDirectories()
  .then(() => {
    console.log('GCS directory initialization completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error initializing GCS directories:', error);
    process.exit(1);
  });