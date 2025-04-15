import { Router } from 'express';
import { db } from './db';
import { eq, and } from 'drizzle-orm';
import { modules, modulePermissions, roleModulePermissions, users } from '@shared/schema';
import { checkModulePermission, getUserModulePermissions, resetUserModulePermissions, setUserModulePermission } from './utils/permission-utils';
import { authenticateUser, isAdmin } from './middlewares/auth';

const router = Router();

// Get all modules
router.get('/api/modules', authenticateUser, async (req, res) => {
  try {
    res.json(modules);
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// Get role-based default permissions
router.get('/api/role-module-permissions', authenticateUser, isAdmin, async (req, res) => {
  try {
    const permissions = await db.select().from(roleModulePermissions);
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching role module permissions:', error);
    res.status(500).json({ error: 'Failed to fetch role module permissions' });
  }
});

// Get a specific user's module permissions (including role-based defaults)
router.get('/api/users/:userId/module-permissions', authenticateUser, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Check if current user is admin or user being requested
    if (req.user!.id !== userId && req.user!.role !== 'Superuser' && req.user!.role !== 'General Manager') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const permissions = await getUserModulePermissions(userId);
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching user module permissions:', error);
    res.status(500).json({ error: 'Failed to fetch user module permissions' });
  }
});

// Set custom permissions for a user on a module
router.post('/api/users/:userId/module-permissions/:moduleName', authenticateUser, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const moduleName = req.params.moduleName as any;
    const { canView, canCreate, canEdit, canDelete } = req.body;
    
    // Validate module name
    if (!modules.includes(moduleName)) {
      return res.status(400).json({ error: 'Invalid module name' });
    }
    
    // Set the permissions
    await setUserModulePermission(userId, moduleName, {
      canView,
      canCreate,
      canEdit,
      canDelete
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting user module permissions:', error);
    res.status(500).json({ error: 'Failed to set user module permissions' });
  }
});

// Reset a user's permissions for a module (reverts to role-based defaults)
router.delete('/api/users/:userId/module-permissions/:moduleName', authenticateUser, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const moduleName = req.params.moduleName as any;
    
    // Validate module name
    if (!modules.includes(moduleName)) {
      return res.status(400).json({ error: 'Invalid module name' });
    }
    
    await resetUserModulePermissions(userId, moduleName);
    res.json({ success: true });
  } catch (error) {
    console.error('Error resetting user module permissions:', error);
    res.status(500).json({ error: 'Failed to reset user module permissions' });
  }
});

// Get all of the current user's permissions
router.get('/api/my-permissions', authenticateUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const permissions = await getUserModulePermissions(userId);
    res.json(permissions);
  } catch (error) {
    console.error('Error getting user module permissions:', error);
    res.status(500).json({ error: 'Failed to get user module permissions' });
  }
});

// Check current user's permission for a module
router.get('/api/my-permissions/:moduleName/:permission', authenticateUser, async (req, res) => {
  try {
    const moduleName = req.params.moduleName as any;
    const permission = req.params.permission as 'view' | 'create' | 'edit' | 'delete';
    
    // Validate module name
    if (!modules.includes(moduleName)) {
      return res.status(400).json({ error: 'Invalid module name' });
    }
    
    // Validate permission type
    if (!['view', 'create', 'edit', 'delete'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission type' });
    }
    
    const hasPermission = await checkModulePermission(req.user!.id, moduleName, permission);
    res.json({ hasPermission });
  } catch (error) {
    console.error('Error checking module permission:', error);
    res.status(500).json({ error: 'Failed to check module permission' });
  }
});

export default router;