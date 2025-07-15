import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, passwordChangeSchema } from "@shared/schema";
import { 
  validatePasswordStrength,
  isPasswordRecentlyUsed,
  updatePasswordHistory,
  hashPassword as secureHashPassword,
  comparePassword as secureVerifyPassword,
  sendPasswordChangeConfirmationEmail,
  generateResetToken,
  getResetTokenExpiry,
  isResetTokenValid,
  sendPasswordResetEmail,
  validatePasswordHistory,
  validatePassword
} from "./utils/password-security";

// Email notification service
async function sendPasswordUpdateNotification(email: string, username: string): Promise<void> {
  try {
    // Check if we have SendGrid configuration
    if (!process.env.SENDGRID_API_KEY) {
      console.log('SendGrid not configured, skipping password update email');
      return;
    }

    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@thermopac.com',
      subject: 'Password Updated Successfully - THERMOPAC Security Alert',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">THERMOPAC</h1>
            <p style="margin: 5px 0 0 0;">Enterprise Resource Planning System</p>
          </div>
          
          <div style="padding: 30px 20px;">
            <h2 style="color: #1e40af; margin-bottom: 20px;">Password Successfully Updated</h2>
            
            <p>Hello <strong>${username}</strong>,</p>
            
            <p>Your password has been successfully updated on <strong>${new Date().toLocaleString()}</strong>.</p>
            
            <div style="background: #f0f9ff; border-left: 4px solid #1e40af; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e40af;">Security Notice</h3>
              <p style="margin: 0;">If you did not make this change, please contact your system administrator immediately.</p>
            </div>
            
            <p>Your new password meets our enhanced security requirements:</p>
            <ul>
              <li>Minimum 12 characters</li>
              <li>Contains uppercase and lowercase letters</li>
              <li>Contains numbers and special characters</li>
              <li>Different from your previous 5 passwords</li>
            </ul>
            
            <p>Thank you for helping keep our systems secure.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              This is an automated security notification from THERMOPAC ERP System.<br>
              Please do not reply to this email.
            </p>
          </div>
        </div>
      `
    };

    await sgMail.send(msg);
    console.log(`Password update notification sent to ${email}`);
  } catch (error) {
    console.error('Failed to send password update email:', error);
    throw error;
  }
}

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  // Check if it's a bcrypt hash (starts with $2b$)
  if (stored.startsWith('$2b$')) {
    return await secureVerifyPassword(supplied, stored);
  }
  
  // Legacy custom hash format (contains a dot separator)
  if (stored.includes('.')) {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  }
  
  // Invalid hash format
  console.error('Invalid password hash format:', stored.substring(0, 20) + '...');
  return false;
}

export function setupAuth(app: Express) {
  if (!process.env.SESSION_SECRET) {
    console.warn("No SESSION_SECRET set, using a default secret (not secure for production)");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'default_secret_for_development',
    resave: true,
    saveUninitialized: true,
    store: storage.sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for better persistence
      secure: false, // Set to false for development to work with HTTP
      httpOnly: true,
      sameSite: 'lax'
    },
    name: 'thermopac.sid' // Custom name to distinguish sessions
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username: string, password: string, done: Function) => {
      try {
        console.log(`Login attempt - username: ${username}`);
        const user = await storage.getUserByUsername(username);

        if (!user) {
          console.log(`Login failed - user not found: ${username}`);
          return done(null, false, { message: "Invalid username or password" });
        }

        console.log(`User found: ${user.username}, role: ${user.role}`);
        const isValid = await comparePasswords(password, user.password);
        console.log(`Password validation result: ${isValid}`);

        if (!isValid) {
          console.log(`Login failed - invalid password for user: ${username}`);
          return done(null, false, { message: "Invalid username or password" });
        }

        console.log(`Login successful for user: ${username}`);
        return done(null, user);
      } catch (error) {
        console.error('Login error:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user: SelectUser, done: Function) => {
    console.log(`Serializing user: ${user.username}`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done: Function) => {
    try {
      console.log(`Deserializing user ID: ${id}`);
      const user = await storage.getUser(id);
      if (user) {
        console.log(`Deserialized user: ${user.username}`);
      } else {
        console.log(`User not found for ID: ${id}`);
      }
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Registration attempt:', { 
        username: req.body.username,
        role: req.body.role,
        email: req.body.email,
        countryCode: req.body.countryCode,
        mobileNumber: req.body.mobileNumber
      });

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log(`Registration failed: Username ${req.body.username} already exists`);
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      console.log(`User created successfully: ${user.username} (${user.role})`);

      if (user.role === "Superuser") {
        await storage.updateUserReportingManager(user.id, user.id);
        console.log(`Set superuser ${user.username} as their own reporting manager`);
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Login after registration failed:', err);
          return next(err);
        }
        console.log(`Auto-login successful for new user: ${user.username}`);
        res.status(201).json(user);
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({message: "Registration failed"});
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log('Login request body:', req.body);

    passport.authenticate("local", (err: Error | null, user: SelectUser | false, info: { message: string } | undefined) => {
      if (err) {
        console.error('Authentication error:', err);
        return next(err);
      }
      if (!user) {
        console.log('Authentication failed:', info?.message);
        return res.status(401).json({ message: info ? info.message : "Invalid username or password" });
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Session creation error:', err);
          return next(err);
        }
        console.log('Login successful:', user.username);
        
        // Check if user needs to update password
        if (user.passwordNeedsUpdate) {
          console.log(`User ${user.username} requires password update`);
          return res.status(200).json({ 
            ...user, 
            requiresPasswordUpdate: true,
            message: "Due to a security update, you must change your password to continue" 
          });
        }
        
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  // Password change endpoint with enhanced security
  app.post("/api/change-password", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { currentPassword, newPassword, confirmPassword } = req.body;
      
      // Validate input using Zod schema
      const validation = passwordChangeSchema.safeParse({
        currentPassword,
        newPassword,
        confirmPassword
      });

      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation failed",
          errors: validation.error.errors.map(e => e.message)
        });
      }

      const user = req.user as SelectUser;
      
      // If current password is provided, verify it (for normal password changes)
      if (currentPassword) {
        const isCurrentPasswordValid = await comparePasswords(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
          return res.status(400).json({ message: "Current password is incorrect" });
        }
      }

      // Validate new password against security requirements
      const passwordValidationErrors = validatePasswordStrength(newPassword);
      if (passwordValidationErrors.length > 0) {
        return res.status(400).json({
          message: "Password validation failed",
          errors: passwordValidationErrors
        });
      }

      // Check password history to prevent reuse
      if (await isPasswordRecentlyUsed(newPassword, user.passwordHistory || [])) {
        return res.status(400).json({
          message: "Password validation failed",
          errors: ["Cannot reuse any of your last 5 passwords"]
        });
      }

      // Hash new password and update history
      const hashedPassword = await secureHashPassword(newPassword);
      const updatedHistory = updatePasswordHistory(user.password, user.passwordHistory || []);

      // Update user password in database
      await storage.updateUserPassword(user.id, {
        password: hashedPassword,
        passwordHistory: updatedHistory,
        passwordNeedsUpdate: false,
        lastPasswordChange: new Date()
      });

      console.log(`Password updated successfully for user: ${user.username}`);

      // Update the session with the new user data to reflect passwordNeedsUpdate: false
      const updatedUser = await storage.getUser(user.id);
      if (updatedUser) {
        req.login(updatedUser, (err) => {
          if (err) {
            console.error('Session update error after password change:', err);
          } else {
            console.log('Session updated successfully after password change');
          }
        });
      }

      // Send email notification
      try {
        await sendPasswordUpdateNotification(user.email, user.username);
      } catch (emailError) {
        console.error('Failed to send password update email:', emailError);
        // Don't fail the password update if email fails
      }

      res.status(200).json({ 
        message: "Password updated successfully",
        requiresPasswordUpdate: false,
        user: updatedUser
      });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Skip mandatory password update (for users with already secure passwords)
  app.post("/api/skip-password-update", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = req.user as SelectUser;
      
      // Update the passwordNeedsUpdate flag to false
      await storage.updateUserPassword(user.id, {
        password: user.password, // Keep current password
        passwordHistory: user.passwordHistory || [],
        passwordNeedsUpdate: false, // Mark as no longer needing update
        lastPasswordChange: user.lastPasswordChange || new Date()
      });

      console.log(`User ${user.username} skipped mandatory password update`);

      // Update the session with the new user data
      const updatedUser = await storage.getUser(user.id);
      if (updatedUser) {
        req.login(updatedUser, (err) => {
          if (err) {
            console.error('Session update error after skip:', err);
            return res.status(500).json({ message: "Session update failed" });
          } else {
            console.log('Session updated successfully after skip');
            res.status(200).json({ 
              message: "Password update skipped successfully",
              requiresPasswordUpdate: false,
              user: updatedUser
            });
          }
        });
      } else {
        res.status(500).json({ message: "Failed to retrieve updated user" });
      }
    } catch (error) {
      console.error('Skip password update error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Request password reset
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      console.log(`Password reset request for email: ${email}`);
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists or not for security
        return res.status(200).json({ 
          message: "If an account with this email exists, you will receive a password reset link shortly." 
        });
      }

      // Generate reset token
      const resetToken = generateResetToken();
      const expiresAt = getResetTokenExpiry();

      // Store reset token in database
      await storage.updateUserResetToken(user.id, resetToken, expiresAt);

      // Send reset email
      await sendPasswordResetEmail(user.email, user.username, resetToken);

      console.log(`Password reset email sent to ${email}`);
      
      res.status(200).json({ 
        message: "If an account with this email exists, you will receive a password reset link shortly." 
      });
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reset password with token
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      console.log(`Password reset attempt with token: ${token.substring(0, 8)}...`);
      
      // Find user by reset token
      const user = await storage.getUserByResetToken(token);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Check token expiration
      if (!isResetTokenValid(user.resetTokenExpiresAt)) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Validate new password
      const passwordValidationErrors = validatePasswordStrength(newPassword);
      if (passwordValidationErrors.length > 0) {
        return res.status(400).json({
          message: "Password validation failed",
          errors: passwordValidationErrors
        });
      }

      // Check password history
      if (await isPasswordRecentlyUsed(newPassword, user.passwordHistory || [])) {
        return res.status(400).json({
          message: "Password validation failed",
          errors: ["Cannot reuse any of your last 5 passwords"]
        });
      }

      // Hash new password and update history
      const hashedPassword = await secureHashPassword(newPassword);
      const updatedHistory = updatePasswordHistory(user.password, user.passwordHistory || []);

      // Update user password and clear reset token
      await storage.updateUserPassword(user.id, {
        password: hashedPassword,
        passwordHistory: updatedHistory,
        passwordNeedsUpdate: false,
        lastPasswordChange: new Date()
      });

      // Clear reset token
      await storage.clearUserResetToken(user.id);

      console.log(`Password reset successful for user: ${user.username}`);

      // Send email notification
      try {
        await sendPasswordUpdateNotification(user.email, user.username);
      } catch (emailError) {
        console.error('Failed to send password update email:', emailError);
        // Don't fail the password reset if email fails
      }

      res.status(200).json({ 
        message: "Password reset successful. You can now login with your new password." 
      });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/logout", (req, res, next) => {
    console.log(`Logout request for user: ${req.user?.username}`);
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return next(err);
      }
      console.log('Logout successful');
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthenticated user tried to access /api/user');
      return res.sendStatus(401);
    }
    console.log(`Current user: ${req.user?.username}`);
    res.json(req.user);
  });

  app.get("/api/users", async (req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
  });
}