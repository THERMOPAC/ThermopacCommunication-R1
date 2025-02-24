import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

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
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  if (!process.env.SESSION_SECRET) {
    console.warn("No SESSION_SECRET set, using a default secret (not secure for production)");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'default_secret_for_development',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`Login attempt - username: ${username}`);
        const user = await storage.getUserByUsername(username);

        if (!user) {
          console.log(`Login failed - user not found: ${username}`);
          return done(null, false, { message: "Invalid username or password" });
        }

        console.log(`User found: ${user.username}, role: ${user.role}`);
        console.log(`Stored password hash: ${user.password}`);

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

  passport.serializeUser((user, done) => {
    console.log(`Serializing user: ${user.username}`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
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

    passport.authenticate("local", (err, user, info) => {
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
        res.status(200).json(user);
      });
    })(req, res, next);
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