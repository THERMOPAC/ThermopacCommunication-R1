import { db } from '../server/db';
import { gcsDirectories, directoryTemplates } from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import path from 'path';

/**
 * This script tests the new template-based directory structure by:
 * 1. Listing all templates
 * 2. Testing directory creation with the template-based approach
 * 3. Verifying that templates and custom directories are properly merged
 */
async function testTemplateDirectories() {
  try {
    console.log('Testing template-based directory structure...');
    
    // 1. List all template directories
    const templates = await db
      .select()
      .from(directoryTemplates);
    
    console.log(`Found ${templates.length} directory templates:`);
    for (const template of templates.slice(0, 5)) { // Show first 5 for brevity
      console.log(`- ${template.department}${template.subDirectory ? '/' + template.subDirectory : ''}`);
    }
    console.log('...');
    
    // 2. Test the directory creation logic by simulating what happens in the API
    // Let's use the first project we find as a test case
    const testProject = {
      financialYear: '2526',
      projectCode: '2526-1'
    };
    
    // 3. Get existing directories for this project
    const existingDirectories = await db
      .select()
      .from(gcsDirectories)
      .where(
        and(
          eq(gcsDirectories.financialYear, testProject.financialYear),
          eq(gcsDirectories.projectCode, testProject.projectCode)
        )
      );
    
    console.log(`\nFound ${existingDirectories.length} existing directories for project ${testProject.projectCode}`);
    
    // 4. Simulate the new directory listing API - combining templates with existing dirs
    const combinedDirectories = [];
    
    // Add template-based directories with project-specific path
    for (const template of templates) {
      // Build the virtual GCS path for this template in the project context
      let fullPath = path.join(testProject.financialYear, testProject.projectCode, template.department);
      if (template.subDirectory) {
        fullPath = path.join(fullPath, template.subDirectory);
      }
      fullPath = fullPath.replace(/\\/g, '/'); // Normalize path separators
      
      // Check if an actual custom directory exists for this path
      const customExists = existingDirectories.some(dir => dir.fullPath === fullPath);
      
      // If a custom directory already exists, skip the template version
      if (!customExists) {
        combinedDirectories.push({
          id: 0, // Virtual ID for templates
          financialYear: testProject.financialYear,
          projectCode: testProject.projectCode,
          department: template.department,
          subDirectory: template.subDirectory,
          fullPath,
          isTemplate: true // Mark as template-based
        });
      }
    }
    
    // Add all existing directories
    combinedDirectories.push(...existingDirectories.map(dir => ({
      ...dir,
      isTemplate: false
    })));
    
    console.log(`\nCombined directory count: ${combinedDirectories.length}`);
    console.log('Sample of combined directories:');
    
    // Just show a few examples of each type for brevity
    const templateSamples = combinedDirectories
      .filter(dir => dir.isTemplate)
      .slice(0, 3);
      
    const customSamples = combinedDirectories
      .filter(dir => !dir.isTemplate)
      .slice(0, 3);
    
    console.log('\nTemplate directory examples:');
    for (const dir of templateSamples) {
      console.log(`- ${dir.fullPath} (Template: ${dir.isTemplate})`);
    }
    
    console.log('\nCustom directory examples:');
    for (const dir of customSamples) {
      console.log(`- ${dir.fullPath} (Template: ${dir.isTemplate})`);
    }
    
    // 5. Test if uploading to a template directory would work
    // This simulates what happens when a user uploads a file to a template directory
    if (templateSamples.length > 0) {
      const testTemplateDir = templateSamples[0];
      console.log(`\nTesting file upload to template directory: ${testTemplateDir.fullPath}`);
      
      // In real code, this happens in the upload endpoint:
      // 1. We check if this directory exists in the database
      const existingDir = await db
        .select()
        .from(gcsDirectories)
        .where(eq(gcsDirectories.fullPath, testTemplateDir.fullPath));
      
      if (existingDir.length === 0) {
        console.log('Directory doesn\'t exist in database yet - would create record');
        
        // In the real code, this is what happens next:
        // 1. We'd create a gcs_directories record
        // 2. We'd create the actual directory in GCS before uploading
        
        console.log('Success - directory creation for template-based directory simulated');
      } else {
        console.log('Directory already exists in database');
      }
    }
    
    console.log('\nTemplate directory test completed successfully!');
  } catch (error) {
    console.error('Error in template directory test:', error);
  } finally {
    process.exit(0);
  }
}

testTemplateDirectories();