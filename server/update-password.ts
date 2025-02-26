import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function updateUserPassword(userId: number, newPassword: string) {
  const hashedPassword = await hashPassword(newPassword);
  return hashedPassword;
}

// Export the functions to use in routes
export { hashPassword, updateUserPassword };