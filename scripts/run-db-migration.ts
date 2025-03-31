import { sql } from "drizzle-orm";
import { db } from "../server/db";
import * as schema from "../shared/schema";

async function main() {
  console.log("Creating database tables...");

  // Create achievements table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS achievements (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      icon TEXT,
      threshold INTEGER NOT NULL,
      points INTEGER NOT NULL,
      created_at TEXT
    )
  `);

  // Create user_achievements table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_achievements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      achievement_id INTEGER NOT NULL,
      earned_at TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Create productivity_metrics table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS productivity_metrics (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      tasks_created INTEGER NOT NULL DEFAULT 0,
      recommendations_accepted INTEGER NOT NULL DEFAULT 0,
      average_completion_time INTEGER NOT NULL DEFAULT 0,
      on_time_completion INTEGER NOT NULL DEFAULT 0,
      weekly_score INTEGER NOT NULL DEFAULT 0,
      monthly_score INTEGER NOT NULL DEFAULT 0,
      total_points INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL
    )
  `);

  // Insert some initial achievement data
  const existingAchievements = await db.execute(sql`SELECT COUNT(*) FROM achievements`);
  const count = existingAchievements.rows[0] ? parseInt(existingAchievements.rows[0].count as string) : 0;
  
  if (count === 0) {
    console.log("Creating initial achievement data...");
    const currentDate = new Date().toISOString();
    
    // Task category achievements
    await db.execute(sql`
      INSERT INTO achievements (name, description, category, icon, threshold, points, created_at)
      VALUES 
        ('Task Master', 'Complete 10 tasks', 'task', 'trophy', 10, 100, ${currentDate}),
        ('Delegator', 'Create 5 tasks for your team', 'task', 'clipboard', 5, 50, ${currentDate}),
        ('On-Time Hero', 'Complete 5 tasks before their due dates', 'task', 'clock', 5, 75, ${currentDate})
    `);
    
    // Productivity category achievements
    await db.execute(sql`
      INSERT INTO achievements (name, description, category, icon, threshold, points, created_at)
      VALUES 
        ('Efficiency Expert', 'Maintain an average task completion time under 24 hours', 'productivity', 'zap', 24, 150, ${currentDate}),
        ('Point Collector', 'Earn 500 productivity points', 'productivity', 'award', 500, 200, ${currentDate})
    `);
    
    // Collaboration category achievements
    await db.execute(sql`
      INSERT INTO achievements (name, description, category, icon, threshold, points, created_at)
      VALUES 
        ('Team Player', 'Forward 3 tasks to appropriate team members', 'collaboration', 'users', 3, 50, ${currentDate})
    `);
    
    // Leadership category achievements
    await db.execute(sql`
      INSERT INTO achievements (name, description, category, icon, threshold, points, created_at)
      VALUES 
        ('Mentor', 'Have 3 or more direct reports', 'leadership', 'star', 3, 100, ${currentDate})
    `);
  }

  // Initialize productivity metrics for existing users
  const currentTimestamp = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO productivity_metrics (user_id, tasks_completed, tasks_created, 
      recommendations_accepted, average_completion_time, on_time_completion, 
      weekly_score, monthly_score, total_points, last_updated)
    SELECT 
      id, 
      0, -- tasks_completed 
      0, -- tasks_created
      0, -- recommendations_accepted
      0, -- average_completion_time
      0, -- on_time_completion
      0, -- weekly_score 
      0, -- monthly_score
      0, -- total_points
      ${currentTimestamp} -- last_updated
    FROM users
    WHERE NOT EXISTS (
      SELECT 1 FROM productivity_metrics WHERE productivity_metrics.user_id = users.id
    )
  `);

  console.log("Database migration completed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error during migration:", err);
  process.exit(1);
});