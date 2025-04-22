import { db } from '../server/db';
import { masterItems } from '../shared/schema';
import { eq, isNull } from 'drizzle-orm';

/**
 * Utility script to fix null makeOrBuy values in masterItems table
 * 
 * This script:
 * 1. Finds all master items with null makeOrBuy values
 * 2. Updates them to 'Make' by default
 * 3. Logs the results
 * 
 * Run with: npx tsx scripts/fix-make-buy-values.ts
 */
async function fixMakeOrBuyValues() {
  try {
    console.log('Starting fix for null makeOrBuy values...');
    
    // Get all items with null makeOrBuy
    const itemsWithNullMakeOrBuy = await db.query.masterItems.findMany({
      where: isNull(masterItems.makeOrBuy)
    });
    
    console.log(`Found ${itemsWithNullMakeOrBuy.length} master items with null makeOrBuy values`);
    
    if (itemsWithNullMakeOrBuy.length === 0) {
      console.log('No items to fix. All items have makeOrBuy values set.');
      return;
    }
    
    // Log the affected items
    console.log('Affected items:');
    itemsWithNullMakeOrBuy.forEach((item, index) => {
      console.log(`${index + 1}. ${item.itemCode} - ${item.description}`);
    });
    
    // Update all items with null makeOrBuy to 'Make'
    const result = await db.update(masterItems)
      .set({ makeOrBuy: 'Make' })
      .where(isNull(masterItems.makeOrBuy))
      .returning({ 
        id: masterItems.id, 
        itemCode: masterItems.itemCode 
      });
    
    console.log(`Successfully updated ${result.length} items to have makeOrBuy='Make'`);
    console.log('Fix completed successfully!');
    
  } catch (error) {
    console.error('Error fixing makeOrBuy values:', error);
  } finally {
    process.exit(0);
  }
}

// Run the function
fixMakeOrBuyValues();