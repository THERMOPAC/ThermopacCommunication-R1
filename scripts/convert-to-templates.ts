import { db } from '../server/db';
import { gcsDirectories, directoryTemplates } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * This script converts existing directory records to use the template-based approach:
 * 1. Finds all directories that match template patterns
 * 2. Adds isTemplate flag to directories (simulation only, we'll just list them)
 * 3. Identifies custom directories (those not matching any template)
 */
async function convertToTemplates() {
  try {
    console.log('Starting conversion to template-based directories...');
    
    // Get all templates
    const templates = await db
      .select()
      .from(directoryTemplates);
    
    console.log(`Found ${templates.length} directory templates`);
    
    // Get all existing directories
    const allDirectories = await db
      .select()
      .from(gcsDirectories);
    
    console.log(`Found ${allDirectories.length} existing directory records`);
    
    // Group directories by project (financialYear + projectCode)
    const projectDirs = new Map();
    
    for (const dir of allDirectories) {
      const projectKey = `${dir.financialYear}/${dir.projectCode}`;
      
      if (!projectDirs.has(projectKey)) {
        projectDirs.set(projectKey, []);
      }
      
      projectDirs.get(projectKey).push(dir);
    }
    
    console.log(`Found ${projectDirs.size} unique projects with directories`);
    
    // For each project, identify template-based and custom directories
    let totalTemplateMatches = 0;
    let totalCustomDirs = 0;
    
    for (const [projectKey, dirs] of projectDirs.entries()) {
      const templateMatches = [];
      const customDirs = [];
      
      for (const dir of dirs) {
        // Check if this directory matches a template pattern
        const matchingTemplate = templates.find(t => 
          t.department === dir.department && 
          t.subDirectory === dir.subDirectory
        );
        
        if (matchingTemplate) {
          templateMatches.push(dir);
        } else {
          customDirs.push(dir);
        }
      }
      
      totalTemplateMatches += templateMatches.length;
      totalCustomDirs += customDirs.length;
      
      console.log(`\nProject ${projectKey}:`);
      console.log(`- Template-matching directories: ${templateMatches.length}`);
      console.log(`- Custom directories: ${customDirs.length}`);
      
      // Print a few examples
      if (templateMatches.length > 0) {
        console.log('\nTemplate matches examples:');
        for (const dir of templateMatches.slice(0, 3)) {
          console.log(`- ${dir.fullPath}`);
        }
      }
      
      if (customDirs.length > 0) {
        console.log('\nCustom directory examples:');
        for (const dir of customDirs.slice(0, 3)) {
          console.log(`- ${dir.fullPath}`);
        }
      }
    }
    
    console.log('\nSummary:');
    console.log(`- Total template-matching directories: ${totalTemplateMatches}`);
    console.log(`- Total custom directories: ${totalCustomDirs}`);
    console.log(`- Total directories: ${allDirectories.length}`);
    
    // In a real conversion script, we might:
    // 1. Delete directories that match templates (since they're redundant)
    // 2. Or add a isTemplate flag to existing records
    
    console.log('\nConversion analysis complete!');
    console.log('To perform the actual conversion, modify this script to update or delete records based on template matches.');
  } catch (error) {
    console.error('Error in template conversion:', error);
  } finally {
    process.exit(0);
  }
}

convertToTemplates();