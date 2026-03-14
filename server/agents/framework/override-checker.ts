import { db } from '../../db';
import { agentEntityOverrides } from '@shared/schema';
import { eq, and, or, isNull, gt } from 'drizzle-orm';

class OverrideChecker {
  async isEntityBlocked(
    entityType: string,
    entityId: string,
    overrideType: string
  ): Promise<boolean> {
    const overrides = await db.select()
      .from(agentEntityOverrides)
      .where(
        and(
          eq(agentEntityOverrides.entityType, entityType),
          eq(agentEntityOverrides.entityId, entityId),
          eq(agentEntityOverrides.isActive, true),
          or(
            eq(agentEntityOverrides.overrideType, overrideType),
            eq(agentEntityOverrides.overrideType, 'block_all')
          ),
          or(
            isNull(agentEntityOverrides.expiresAt),
            gt(agentEntityOverrides.expiresAt, new Date())
          )
        )
      )
      .limit(1);

    return overrides.length > 0;
  }
}

export const overrideChecker = new OverrideChecker();
