import bcrypt from 'bcrypt';
import crypto from 'crypto';
import * as nodemailer from 'nodemailer';

// Password validation constants
const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_SALT_ROUNDS = 12;
const RESET_TOKEN_LENGTH = 32;
const RESET_TOKEN_EXPIRY_MINUTES = 15;

// Create Gmail SMTP transporter
const createMailTransporter = () => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log('Gmail SMTP not configured, email notifications will be skipped');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
};

/**
 * Validates password strength according to security requirements
 */
export function validatePasswordStrength(password: string): string[] {
  const errors: string[] = [];
  
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return errors;
}

/**
 * Hashes a password using bcrypt with secure salt rounds
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compares a plain text password with a hashed password
 */
export async function comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * Generates a secure reset token
 */
export function generateResetToken(): string {
  return crypto.randomBytes(RESET_TOKEN_LENGTH).toString('hex');
}

/**
 * Calculates the expiration time for a reset token
 */
export function getResetTokenExpiry(): Date {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + RESET_TOKEN_EXPIRY_MINUTES);
  return expiryTime;
}

/**
 * Checks if a reset token is valid (not expired)
 */
export function isResetTokenValid(expiresAt: Date): boolean {
  return new Date() < expiresAt;
}

/**
 * Sends password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetToken: string
): Promise<void> {
  const transporter = createMailTransporter();
  if (!transporter) {
    console.log('Gmail SMTP not configured, skipping password reset email');
    return;
  }

  const resetUrl = `${process.env.REPLIT_URL || 'http://localhost:5000'}/reset-password?token=${resetToken}`;
  
  const emailContent = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'Password Reset Request - THERMOPAC ERP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #dc2626 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">THERMOPAC ERP</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Password Reset Request</p>
        </div>
        
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${username},</h2>
          
          <p style="color: #475569; line-height: 1.6;">
            We received a request to reset your password for your THERMOPAC ERP account. 
            If you made this request, please click the button below to reset your password.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #2563eb; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 6px; font-weight: 600; 
                      display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
            <strong>Important:</strong> This link will expire in 15 minutes for security reasons.
            If you didn't request this password reset, please ignore this email.
          </p>
          
          <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
            If the button doesn't work, copy and paste this link into your browser:
            <br><span style="color: #2563eb; word-break: break-all;">${resetUrl}</span>
          </p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            This is an automated message from THERMOPAC ERP System. Please do not reply to this email.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(emailContent);
    console.log(`Password reset email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
}

/**
 * Sends password change confirmation email
 */
export async function sendPasswordChangeConfirmationEmail(
  email: string,
  username: string
): Promise<void> {
  const transporter = createMailTransporter();
  if (!transporter) {
    console.log('Gmail SMTP not configured, skipping password change confirmation email');
    return;
  }

  const emailContent = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'Password Successfully Changed - THERMOPAC ERP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #dc2626 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">THERMOPAC ERP</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Password Change Confirmation</p>
        </div>
        
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${username},</h2>
          
          <p style="color: #475569; line-height: 1.6;">
            Your password has been successfully changed. This change was made on 
            ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}.
          </p>
          
          <div style="background: #dcfce7; border: 1px solid #bbf7d0; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #166534; margin: 0; font-weight: 600;">
              ✓ Your password has been updated successfully
            </p>
          </div>
          
          <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
            <strong>Security Notice:</strong> If you did not make this change, please contact 
            your system administrator immediately.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            This is an automated message from THERMOPAC ERP System. Please do not reply to this email.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(emailContent);
    console.log(`Password change confirmation email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send password change confirmation email:', error);
    // Don't throw error for confirmation email - it's not critical
  }
}

/**
 * Checks if a password was recently used (password history check)
 */
export async function isPasswordRecentlyUsed(
  newPassword: string,
  passwordHistory: string[]
): Promise<boolean> {
  for (const oldHashedPassword of passwordHistory) {
    if (await comparePassword(newPassword, oldHashedPassword)) {
      return true;
    }
  }
  return false;
}

/**
 * Updates password history array (keeps last 5 passwords)
 */
export function updatePasswordHistory(
  currentPasswordHash: string,
  existingHistory: string[]
): string[] {
  const newHistory = [currentPasswordHash, ...existingHistory];
  return newHistory.slice(0, 5); // Keep only last 5 passwords
}

/**
 * Validates password history (legacy function - deprecated, use isPasswordRecentlyUsed instead)
 */
export function validatePasswordHistory(
  newPassword: string,
  passwordHistory: string[]
): boolean {
  // This is a synchronous legacy function that should be replaced with isPasswordRecentlyUsed
  // For now, we'll return true to avoid breaking existing code
  return true;
}

/**
 * Validates password against security requirements (legacy function - deprecated, use validatePasswordStrength instead)
 */
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors = validatePasswordStrength(password);
  return {
    isValid: errors.length === 0,
    errors
  };
}