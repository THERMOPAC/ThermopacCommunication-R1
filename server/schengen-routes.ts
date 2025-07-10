import { Router } from "express";
import { ensureAuthenticated } from "./auth-middleware";
import { db } from "./db";
import { schengenTravelLog, schengenAlerts, users, visaRecords } from "@shared/schema";
import { insertSchengenTravelLogSchema, insertSchengenAlertSchema } from "@shared/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

const router = Router();

// Schengen countries list
const SCHENGEN_COUNTRIES = [
  "Austria", "Belgium", "Croatia", "Czech Republic", "Denmark", "Estonia",
  "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Italy",
  "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Norway", "Poland", "Portugal", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland"
];

// Calculate days in Schengen area within the last 180 days
function calculateSchengenDays(travelLogs: any[], calculationDate: Date = new Date()): number {
  const endDate = new Date(calculationDate);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 180);

  let totalDays = 0;

  for (const log of travelLogs) {
    if (!log.entryDate) continue;

    const entryDate = new Date(log.entryDate);
    const exitDate = log.exitDate ? new Date(log.exitDate) : endDate;

    // Skip if trip is completely outside our 180-day window
    if (exitDate < startDate || entryDate > endDate) {
      continue;
    }

    // Calculate overlap with our 180-day window
    const overlapStart = new Date(Math.max(entryDate.getTime(), startDate.getTime()));
    const overlapEnd = new Date(Math.min(exitDate.getTime(), endDate.getTime()));

    if (overlapStart <= overlapEnd) {
      const days = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      totalDays += days;
    }
  }

  return Math.min(totalDays, 180); // Cap at 180 days
}

// Get all employees with their Schengen compliance status
// Only include employees who have an active visa with Country = "Schengen Area (EU)"
router.get("/dashboard", ensureAuthenticated, async (req, res) => {
  try {
    const employees = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department,
      })
      .from(users)
      .innerJoin(visaRecords, eq(visaRecords.employeeId, users.id))
      .where(
        and(
          eq(users.isActive, true),
          eq(visaRecords.country, "Schengen Area (EU)"),
          eq(visaRecords.status, "Active")
        )
      );

    const dashboardData = [];

    for (const employee of employees) {
      // Get travel logs for this employee
      const travelLogs = await db
        .select()
        .from(schengenTravelLog)
        .where(eq(schengenTravelLog.employeeId, employee.id))
        .orderBy(desc(schengenTravelLog.entryDate));

      // Calculate days used in last 180 days
      const daysUsed = calculateSchengenDays(travelLogs);
      
      // Get latest alert
      const [latestAlert] = await db
        .select()
        .from(schengenAlerts)
        .where(eq(schengenAlerts.employeeId, employee.id))
        .orderBy(desc(schengenAlerts.createdAt))
        .limit(1);

      // Determine status
      let status = "Safe";
      let statusColor = "green";
      
      if (daysUsed >= 90) {
        status = "Exceeded";
        statusColor = "red";
      } else if (daysUsed >= 80) {
        status = "Critical";
        statusColor = "orange";
      } else if (daysUsed >= 60) {
        status = "Warning";
        statusColor = "yellow";
      }

      dashboardData.push({
        employee,
        daysUsed,
        daysRemaining: Math.max(0, 90 - daysUsed),
        status,
        statusColor,
        lastAlert: latestAlert,
        totalTrips: travelLogs.length,
        lastTripDate: travelLogs[0]?.entryDate || null,
      });
    }

    // Sort by days used (highest first)
    dashboardData.sort((a, b) => b.daysUsed - a.daysUsed);

    res.json(dashboardData);
  } catch (error) {
    console.error("Error fetching Schengen dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Get travel log summary for EU tracker display (all employees with Schengen visas)
router.get("/travel-log", ensureAuthenticated, async (req, res) => {
  try {
    // Get employees with active Schengen visas
    const employees = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department,
      })
      .from(users)
      .innerJoin(visaRecords, eq(visaRecords.employeeId, users.id))
      .where(
        and(
          eq(users.isActive, true),
          eq(visaRecords.country, "Schengen Area (EU)"),
          eq(visaRecords.status, "Active")
        )
      );

    const employeeData = [];

    for (const employee of employees) {
      // Get travel logs for this employee
      const travelLogs = await db
        .select()
        .from(schengenTravelLog)
        .where(eq(schengenTravelLog.employeeId, employee.id))
        .orderBy(desc(schengenTravelLog.entryDate));

      // Calculate days used in last 180 days
      const daysUsed = calculateSchengenDays(travelLogs);
      const daysRemaining = Math.max(0, 90 - daysUsed);
      
      // Determine status
      let complianceStatus = "Safe";
      if (daysUsed >= 90) {
        complianceStatus = "Exceeded";
      } else if (daysUsed >= 80) {
        complianceStatus = "Critical";
      } else if (daysUsed >= 60) {
        complianceStatus = "Warning";
      }

      // Calculate current period and next reset
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 180);
      
      const nextReset = new Date(startDate);
      nextReset.setDate(startDate.getDate() + 180);

      employeeData.push({
        employeeId: employee.id,
        employeeName: employee.username,
        currentPeriod: `${startDate.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`,
        daysUsed,
        daysRemaining,
        complianceStatus,
        nextReset: nextReset.toISOString().split('T')[0],
        totalTrips: travelLogs.length
      });
    }

    res.json({ employees: employeeData });
  } catch (error) {
    console.error("Error fetching travel log summary:", error);
    res.status(500).json({ error: "Failed to fetch travel log data" });
  }
});

// Get travel logs for a specific employee
router.get("/travel-logs/:employeeId", ensureAuthenticated, async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const travelLogs = await db
      .select({
        id: schengenTravelLog.id,
        country: schengenTravelLog.country,
        entryDate: schengenTravelLog.entryDate,
        exitDate: schengenTravelLog.exitDate,
        purpose: schengenTravelLog.purpose,
        notes: schengenTravelLog.notes,
        isBusinessTrip: schengenTravelLog.isBusinessTrip,
        createdAt: schengenTravelLog.createdAt,
        createdBy: users.username,
      })
      .from(schengenTravelLog)
      .leftJoin(users, eq(schengenTravelLog.createdBy, users.id))
      .where(eq(schengenTravelLog.employeeId, parseInt(employeeId)))
      .orderBy(desc(schengenTravelLog.entryDate));

    // Calculate days for each trip
    const enrichedLogs = travelLogs.map(log => {
      const entryDate = new Date(log.entryDate);
      const exitDate = log.exitDate ? new Date(log.exitDate) : new Date();
      const days = Math.ceil((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      return {
        ...log,
        daysInCountry: days,
        isOngoing: !log.exitDate,
      };
    });

    res.json(enrichedLogs);
  } catch (error) {
    console.error("Error fetching travel logs:", error);
    res.status(500).json({ error: "Failed to fetch travel logs" });
  }
});

// Add new travel log
router.post("/travel-logs", ensureAuthenticated, async (req, res) => {
  try {
    const validatedData = insertSchengenTravelLogSchema.parse({
      ...req.body,
      createdBy: req.user.id,
    });

    // Check for overlapping travel entries for the same employee
    const entryDate = new Date(validatedData.entryDate);
    const exitDate = validatedData.exitDate ? new Date(validatedData.exitDate) : new Date();

    const existingLogs = await db
      .select()
      .from(schengenTravelLog)
      .where(eq(schengenTravelLog.employeeId, validatedData.employeeId));

    // Check for overlaps with existing travel logs
    for (const log of existingLogs) {
      const existingEntry = new Date(log.entryDate);
      const existingExit = log.exitDate ? new Date(log.exitDate) : new Date();

      // Check if new entry overlaps with existing entry
      const hasOverlap = (
        (entryDate >= existingEntry && entryDate <= existingExit) ||
        (exitDate >= existingEntry && exitDate <= existingExit) ||
        (entryDate <= existingEntry && exitDate >= existingExit)
      );

      if (hasOverlap) {
        return res.status(400).json({
          error: "Travel entry overlaps with existing travel period",
          details: `Overlaps with existing travel from ${existingEntry.toISOString().split('T')[0]} to ${existingExit.toISOString().split('T')[0]}`
        });
      }
    }

    const [newLog] = await db
      .insert(schengenTravelLog)
      .values(validatedData)
      .returning();

    // Calculate new compliance status and create alert if needed
    const travelLogs = await db
      .select()
      .from(schengenTravelLog)
      .where(eq(schengenTravelLog.employeeId, validatedData.employeeId));

    const daysUsed = calculateSchengenDays(travelLogs);
    
    // Create alert if thresholds are crossed
    if (daysUsed >= 60) {
      let alertType = "warning_60";
      if (daysUsed >= 90) alertType = "exceeded_90";
      else if (daysUsed >= 80) alertType = "warning_80";

      // Check if similar alert already exists for today
      const [existingAlert] = await db
        .select()
        .from(schengenAlerts)
        .where(
          and(
            eq(schengenAlerts.employeeId, validatedData.employeeId),
            eq(schengenAlerts.alertType, alertType),
            eq(schengenAlerts.calculationDate, new Date().toISOString().split('T')[0])
          )
        );

      if (!existingAlert) {
        await db.insert(schengenAlerts).values({
          employeeId: validatedData.employeeId,
          alertType,
          daysUsed,
          calculationDate: new Date().toISOString().split('T')[0],
        });
      }
    }

    res.json(newLog);
  } catch (error) {
    console.error("Error creating travel log:", error);
    res.status(500).json({ error: "Failed to create travel log" });
  }
});

// Update travel log
router.put("/travel-logs/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = insertSchengenTravelLogSchema.parse(req.body);

    const [updatedLog] = await db
      .update(schengenTravelLog)
      .set(validatedData)
      .where(eq(schengenTravelLog.id, parseInt(id)))
      .returning();

    if (!updatedLog) {
      return res.status(404).json({ error: "Travel log not found" });
    }

    res.json(updatedLog);
  } catch (error) {
    console.error("Error updating travel log:", error);
    res.status(500).json({ error: "Failed to update travel log" });
  }
});

// Delete travel log
router.delete("/travel-logs/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    const [deletedLog] = await db
      .delete(schengenTravelLog)
      .where(eq(schengenTravelLog.id, parseInt(id)))
      .returning();

    if (!deletedLog) {
      return res.status(404).json({ error: "Travel log not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting travel log:", error);
    res.status(500).json({ error: "Failed to delete travel log" });
  }
});

// Get alerts for an employee
router.get("/alerts/:employeeId", ensureAuthenticated, async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const alerts = await db
      .select({
        id: schengenAlerts.id,
        alertType: schengenAlerts.alertType,
        daysUsed: schengenAlerts.daysUsed,
        calculationDate: schengenAlerts.calculationDate,
        isAcknowledged: schengenAlerts.isAcknowledged,
        acknowledgedBy: users.username,
        acknowledgedAt: schengenAlerts.acknowledgedAt,
        createdAt: schengenAlerts.createdAt,
      })
      .from(schengenAlerts)
      .leftJoin(users, eq(schengenAlerts.acknowledgedBy, users.id))
      .where(eq(schengenAlerts.employeeId, parseInt(employeeId)))
      .orderBy(desc(schengenAlerts.createdAt));

    res.json(alerts);
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// Acknowledge alert
router.put("/alerts/:id/acknowledge", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    const [updatedAlert] = await db
      .update(schengenAlerts)
      .set({
        isAcknowledged: true,
        acknowledgedBy: req.user.id,
        acknowledgedAt: new Date(),
      })
      .where(eq(schengenAlerts.id, parseInt(id)))
      .returning();

    if (!updatedAlert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    res.json(updatedAlert);
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

// Get employee list for dropdowns
// Only include employees who have an active visa with Country = "Schengen Area (EU)"
router.get("/employees", ensureAuthenticated, async (req, res) => {
  try {
    const employees = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department,
      })
      .from(users)
      .innerJoin(visaRecords, eq(visaRecords.employeeId, users.id))
      .where(
        and(
          eq(users.isActive, true),
          eq(visaRecords.country, "Schengen Area (EU)"),
          eq(visaRecords.status, "Active")
        )
      )
      .orderBy(users.username);

    res.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

// Get Schengen countries list
router.get("/countries", ensureAuthenticated, async (req, res) => {
  res.json(SCHENGEN_COUNTRIES);
});

export default router;