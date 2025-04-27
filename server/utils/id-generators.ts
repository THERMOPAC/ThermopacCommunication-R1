import { pool } from "../db";
import { format } from "date-fns";

/**
 * Generates a unique ID for a welder in the format W-XXXX
 * where XXXX is a sequential number padded to 4 digits
 */
export async function generateWelderID(): Promise<string> {
  try {
    // Get the current highest welder ID number
    const result = await pool.query(`
      SELECT "welderId" FROM welders 
      WHERE "welderId" LIKE 'W-%'
      ORDER BY "welderId" DESC
      LIMIT 1
    `);

    let nextNum = 1;
    if (result.rows.length > 0) {
      const lastID = result.rows[0].welderId;
      const numPart = lastID.split('-')[1];
      nextNum = parseInt(numPart) + 1;
    }

    // Format the next number with leading zeros to 4 digits
    const paddedNum = nextNum.toString().padStart(4, '0');
    return `W-${paddedNum}`;
  } catch (error) {
    console.error("Error generating welder ID:", error);
    // Fallback in case of DB error
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    return `W-${randomNum}`;
  }
}

/**
 * Generates a certificate number in the format CERT-YYYY-MM-XXXX
 * where YYYY-MM is the current year and month, and XXXX is a sequential number
 */
export async function generateCertificateNumber(): Promise<string> {
  try {
    const today = new Date();
    const yearMonth = format(today, "yyyy-MM");
    const prefix = `CERT-${yearMonth}-`;

    // Get the current highest certificate number for this month
    const result = await pool.query(`
      SELECT "certificateNo" FROM welders 
      WHERE "certificateNo" LIKE $1
      ORDER BY "certificateNo" DESC
      LIMIT 1
    `, [`${prefix}%`]);

    let nextNum = 1;
    if (result.rows.length > 0) {
      const lastNum = result.rows[0].certificateNo;
      const numPart = lastNum.split('-')[3];
      nextNum = parseInt(numPart) + 1;
    }

    // Format the next number with leading zeros to 4 digits
    const paddedNum = nextNum.toString().padStart(4, '0');
    return `${prefix}${paddedNum}`;
  } catch (error) {
    console.error("Error generating certificate number:", error);
    // Fallback in case of DB error
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const yearMonth = format(new Date(), "yyyy-MM");
    return `CERT-${yearMonth}-${randomNum}`;
  }
}

/**
 * Generates a unique WPS ID in the format WPS-XXXXX
 * where XXXXX is a sequential number padded to 5 digits
 */
export async function generateWpsID(): Promise<string> {
  try {
    // Get the current highest WPS ID number
    const result = await pool.query(`
      SELECT "wpsId" FROM wps_documents 
      WHERE "wpsId" LIKE 'WPS-%'
      ORDER BY "wpsId" DESC
      LIMIT 1
    `);

    let nextNum = 1;
    if (result.rows.length > 0) {
      const lastID = result.rows[0].wpsId;
      const numPart = lastID.split('-')[1];
      nextNum = parseInt(numPart) + 1;
    }

    // Format the next number with leading zeros to 5 digits
    const paddedNum = nextNum.toString().padStart(5, '0');
    return `WPS-${paddedNum}`;
  } catch (error) {
    console.error("Error generating WPS ID:", error);
    // Fallback in case of DB error
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    return `WPS-${randomNum}`;
  }
}

/**
 * Generates a unique PQR ID in the format PQR-XXXXX
 * where XXXXX is a sequential number padded to 5 digits,
 * matching the WPS ID number to maintain the relationship
 */
export async function generatePqrID(wpsId: string): Promise<string> {
  try {
    if (!wpsId || !wpsId.startsWith('WPS-')) {
      throw new Error('Invalid WPS ID format');
    }
    
    // Extract the number part from WPS ID and use it for PQR
    const numPart = wpsId.split('-')[1];
    return `PQR-${numPart}`;
  } catch (error) {
    console.error("Error generating PQR ID:", error);
    // Fallback in case of error
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    return `PQR-${randomNum}`;
  }
}