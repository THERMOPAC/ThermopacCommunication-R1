/**
 * This script creates the project_key_stages table and adds initial data
 */
import { db, pool } from '../server/db';
import { projectKeyStages, users, projects } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function createProjectKeyStagesTable() {
  console.log('Creating project_key_stages table...');
  
  try {
    // Create the project_key_stages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_key_stages (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        stage_number INTEGER NOT NULL,
        stage_name TEXT NOT NULL,
        phase TEXT NOT NULL,
        description TEXT,
        is_completed BOOLEAN NOT NULL DEFAULT FALSE,
        completed_date TIMESTAMP,
        completed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('project_key_stages table created successfully');
    
    // Get all projects
    const allProjects = await db.select().from(projects);
    console.log(`Found ${allProjects.length} projects to add key stages to`);
    
    // Define the standard key stages for each project
    const standardKeyStages = [
      // Design Phase (stages 1-8)
      { stage_number: 1, stage_name: "Project Requirements Gathered", phase: "Design", description: "Initial client requirements have been documented" },
      { stage_number: 2, stage_name: "Project Scope Defined", phase: "Design", description: "Detailed project scope and deliverables have been approved" },
      { stage_number: 3, stage_name: "Initial Design Completed", phase: "Design", description: "Conceptual design has been created and reviewed" },
      { stage_number: 4, stage_name: "Detailed Design Approved", phase: "Design", description: "Detailed engineering design has been approved by stakeholders" },
      { stage_number: 5, stage_name: "P&ID Drawings Complete", phase: "Design", description: "Piping and Instrumentation Diagrams finalized" },
      { stage_number: 6, stage_name: "GA Drawings Complete", phase: "Design", description: "General Arrangement drawings finalized" },
      { stage_number: 7, stage_name: "3D Model Complete", phase: "Design", description: "3D model of the system has been finalized" },
      { stage_number: 8, stage_name: "BOM Finalized", phase: "Design", description: "Bill of Materials has been completed and approved" },
      
      // Procurement Phase (stages 9-15)
      { stage_number: 9, stage_name: "RFQs Sent", phase: "Procurement", description: "Request for Quotations sent to potential vendors" },
      { stage_number: 10, stage_name: "Vendor Quotes Received", phase: "Procurement", description: "Quotes from vendors have been received and analyzed" },
      { stage_number: 11, stage_name: "Vendors Selected", phase: "Procurement", description: "Final vendors have been selected" },
      { stage_number: 12, stage_name: "POs Issued", phase: "Procurement", description: "Purchase Orders have been issued to vendors" },
      { stage_number: 13, stage_name: "Long Lead Items Ordered", phase: "Procurement", description: "Critical items with long delivery times have been ordered" },
      { stage_number: 14, stage_name: "All Materials Ordered", phase: "Procurement", description: "All remaining materials have been ordered" },
      { stage_number: 15, stage_name: "All Materials Received", phase: "Procurement", description: "All ordered materials have been received" },
      
      // Manufacturing Phase (stages 16-22)
      { stage_number: 16, stage_name: "Fabrication Started", phase: "Manufacturing", description: "Manufacturing/fabrication has begun" },
      { stage_number: 17, stage_name: "Shell Fabrication Complete", phase: "Manufacturing", description: "Main equipment shell fabrication is complete" },
      { stage_number: 18, stage_name: "Internal Components Installed", phase: "Manufacturing", description: "Internal components have been installed" },
      { stage_number: 19, stage_name: "Instrumentation Installed", phase: "Manufacturing", description: "All instrumentation has been installed" },
      { stage_number: 20, stage_name: "Piping Complete", phase: "Manufacturing", description: "All piping work has been completed" },
      { stage_number: 21, stage_name: "Electrical Work Complete", phase: "Manufacturing", description: "All electrical connections have been completed" },
      { stage_number: 22, stage_name: "Manufacturing Complete", phase: "Manufacturing", description: "All manufacturing processes have been completed" },
      
      // Quality Phase (stages 23-27)
      { stage_number: 23, stage_name: "Factory Testing Started", phase: "Quality", description: "Factory Acceptance Testing has begun" },
      { stage_number: 24, stage_name: "Factory Testing Complete", phase: "Quality", description: "Factory Acceptance Testing has been completed successfully" },
      { stage_number: 25, stage_name: "Quality Documentation Complete", phase: "Quality", description: "All quality documentation has been finalized" },
      { stage_number: 26, stage_name: "Equipment Packaged for Shipping", phase: "Quality", description: "Equipment has been properly packaged for shipping" },
      { stage_number: 27, stage_name: "Final Inspection Complete", phase: "Quality", description: "Final inspection has been completed before shipping" }
    ];
    
    // Add the standard key stages to each project
    for (const project of allProjects) {
      console.log(`Adding key stages to project ${project.id}: ${project.name}`);
      
      for (const stage of standardKeyStages) {
        await db.insert(projectKeyStages).values({
          project_id: project.id,
          stage_number: stage.stage_number,
          stage_name: stage.stage_name,
          phase: stage.phase,
          description: stage.description,
          is_completed: false
        });
      }
      
      console.log(`Added ${standardKeyStages.length} key stages to project ${project.id}`);
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error creating project_key_stages table:', error);
  } finally {
    await pool.end();
  }
}

createProjectKeyStagesTable()
  .then(() => console.log('Script completed'))
  .catch(err => console.error('Script failed:', err));