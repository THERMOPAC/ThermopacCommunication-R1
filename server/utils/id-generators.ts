/**
 * Utility functions for generating consistent ID formats
 * across the application.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Generates a welder ID in the format W-XXX
 * where XXX is a zero-padded number based on the current count of welders
 * @returns Promise with the generated welder ID
 */
export async function generateWelderId(): Promise<string> {
  try {
    // Get the count of existing welders
    const result = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM welders`
    );
    
    const count = result[0]?.count ?? 0;
    // Add 1 to get the next ID and pad with zeros
    const nextId = (count + 1).toString().padStart(3, '0');
    
    return `W-${nextId}`;
  } catch (error) {
    console.error('Error generating welder ID:', error);
    // Fallback to a timestamp-based ID if database query fails
    const timestamp = Date.now().toString().slice(-5);
    return `W-${timestamp}`;
  }
}

/**
 * Generates a WPQR document ID in the format WPQR-XXX
 * @returns Promise with the generated WPQR ID
 */
export async function generateWpqrId(): Promise<string> {
  try {
    // Get the count of existing WPQR documents
    const result = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM wpqr_documents`
    );
    
    const count = result[0]?.count ?? 0;
    // Add 1 to get the next ID
    const nextId = count + 1;
    
    return `WPQR-${nextId}`;
  } catch (error) {
    console.error('Error generating WPQR ID:', error);
    // Fallback to a timestamp-based ID if database query fails
    const timestamp = Date.now().toString().slice(-5);
    return `WPQR-${timestamp}`;
  }
}

/**
 * Generates a WPS document ID in the format WPS-XXX
 * @returns Promise with the generated WPS ID
 */
export async function generateWpsId(): Promise<string> {
  try {
    // Get the count of existing WPS documents
    const result = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM wps_documents`
    );
    
    const count = result[0]?.count ?? 0;
    // Add 1 to get the next ID
    const nextId = count + 1;
    
    return `WPS-${nextId}`;
  } catch (error) {
    console.error('Error generating WPS ID:', error);
    // Fallback to a timestamp-based ID if database query fails
    const timestamp = Date.now().toString().slice(-5);
    return `WPS-${timestamp}`;
  }
}

/**
 * Generates a PQR document ID in the format PQR-XXX
 * @returns Promise with the generated PQR ID
 */
export async function generatePqrId(): Promise<string> {
  try {
    // Get the count of existing PQR documents
    const result = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM pqr_documents`
    );
    
    const count = result[0]?.count ?? 0;
    // Add 1 to get the next ID
    const nextId = count + 1;
    
    return `PQR-${nextId}`;
  } catch (error) {
    console.error('Error generating PQR ID:', error);
    // Fallback to a timestamp-based ID if database query fails
    const timestamp = Date.now().toString().slice(-5);
    return `PQR-${timestamp}`;
  }
}

/**
 * Generates a Material Identification ID in the format MI-YYYY-XXX
 * where YYYY is the current year and XXX is a sequential number
 * @returns Promise with the generated MI ID
 */
export async function generateMaterialIdentificationId(): Promise<string> {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get the count of MIs for the current year
    const result = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM material_identifications WHERE id LIKE ${`MI-${currentYear}-%`}`
    );
    
    const count = result[0]?.count ?? 0;
    // Add 1 to get the next ID
    const nextId = count + 1;
    
    return `MI-${currentYear}-${nextId}`;
  } catch (error) {
    console.error('Error generating Material Identification ID:', error);
    // Fallback to a timestamp-based ID if database query fails
    const currentYear = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-5);
    return `MI-${currentYear}-${timestamp}`;
  }
}