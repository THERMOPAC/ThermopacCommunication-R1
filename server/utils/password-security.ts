import bcrypt from 'bcrypt';
import sgMail from '@sendgrid/mail';

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface PasswordRequirement {
  test: (password: string) => boolean;
  message: string;
}

export const passwordRequirements: PasswordRequirement[] = [
  {
    test: (password: string) => password.length >= 12,
    message: 'Password must be at least 12 characters long'
  },
  {
    test: (password: string) => /[A-Z]/.test(password),
    message: 'Password must contain at least one uppercase letter'
  },
  {
    test: (password: string) => /[a-z]/.test(password),
    message: 'Password must contain at least one lowercase letter'
  },
  {
    test: (password: string) => /\d/.test(password),
    message: 'Password must contain at least one number'
  },
  {
    test: (password: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    message: 'Password must contain at least one special character'
  }
];

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  
  for (const requirement of passwordRequirements) {
    if (!requirement.test(password)) {
      errors.push(requirement.message);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validatePasswordHistory(newPassword: string, passwordHistory: string[]): boolean {
  // Check if new password matches any of the last 5 passwords
  for (const hashedPassword of passwordHistory) {
    if (bcrypt.compareSync(newPassword, hashedPassword)) {
      return false; // Password was used before
    }
  }
  return true; // Password is unique
}

export function updatePasswordHistory(currentPassword: string, passwordHistory: string[]): string[] {
  const newHistory = [...passwordHistory];
  
  // Add current password to history
  newHistory.push(currentPassword);
  
  // Keep only last 5 passwords
  if (newHistory.length > 5) {
    newHistory.shift();
  }
  
  return newHistory;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function sendPasswordUpdateNotification(email: string, username: string): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SendGrid API key not configured, skipping password update notification');
    return;
  }

  const msg = {
    to: email,
    from: 'system@thermopac.in', // Use your verified sender
    subject: 'Password Updated Successfully - THERMOPAC ERP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #3B82F6; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">THERMOPAC ERP</h1>
          <p style="margin: 10px 0 0 0; font-size: 14px;">Enterprise Resource Planning System</p>
        </div>
        
        <div style="padding: 30px; background-color: #f9fafb;">
          <h2 style="color: #1f2937; margin-top: 0;">Password Updated Successfully</h2>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Hello <strong>${username}</strong>,
          </p>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Your password has been successfully updated as part of our security enhancement initiative. 
            Your account is now protected with our new, stronger password requirements.
          </p>
          
          <div style="background-color: #e0f2fe; border-left: 4px solid #3B82F6; padding: 15px; margin: 20px 0;">
            <h3 style="color: #1e3a8a; margin: 0 0 10px 0; font-size: 16px;">Security Update Details:</h3>
            <ul style="color: #1e40af; margin: 0; padding-left: 20px; line-height: 1.6;">
              <li>Minimum 12 characters required</li>
              <li>Must include uppercase and lowercase letters</li>
              <li>Must include numbers and special characters</li>
              <li>Password history tracking prevents reuse</li>
            </ul>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6;">
            <strong>Date:</strong> ${new Date().toLocaleString('en-IN', { 
              timeZone: 'Asia/Kolkata',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
          
          <p style="color: #4b5563; line-height: 1.6;">
            If you did not initiate this password change, please contact your system administrator immediately.
          </p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px; margin: 0;">
              This is an automated message from THERMOPAC ERP System. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`Password update notification sent to ${email}`);
  } catch (error) {
    console.error('Failed to send password update notification:', error);
    // Don't throw error to prevent blocking the password update process
  }
}