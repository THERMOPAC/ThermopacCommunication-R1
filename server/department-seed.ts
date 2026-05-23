import { db } from "./db";
import { departmentMaster } from "@shared/schema";

const SEED_DEPARTMENTS = [
  { name: "Accounts",           code: "ACC", sortOrder: 10,  isActive: true  },
  { name: "Administration",     code: "ADM", sortOrder: 20,  isActive: true  },
  { name: "After Sales",        code: "AFS", sortOrder: 30,  isActive: true  },
  { name: "Design",             code: "DES", sortOrder: 40,  isActive: true  },
  { name: "Marketing",          code: "MKT", sortOrder: 50,  isActive: true  },
  { name: "Production",         code: "PRD", sortOrder: 60,  isActive: true  },
  { name: "Projects",           code: "PRJ", sortOrder: 70,  isActive: true  },
  { name: "Purchase",           code: "PUR", sortOrder: 80,  isActive: true  },
  { name: "Quality Control",    code: "QC",  sortOrder: 90,  isActive: true  },
  { name: "Stores",             code: "STR", sortOrder: 100, isActive: true  },
  { name: "Engineering",        code: "ENG", sortOrder: 110, isActive: false },
  { name: "General Management", code: "GM",  sortOrder: 120, isActive: false },
];

export async function seedDepartmentMaster(): Promise<void> {
  for (const dept of SEED_DEPARTMENTS) {
    await db.insert(departmentMaster)
      .values(dept)
      .onConflictDoNothing();
  }
  console.log("[DeptSeed] department_master seeded — 10 active, 2 inactive preserved.");
}
