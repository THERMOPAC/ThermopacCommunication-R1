import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import UserProfile from "@/components/user-profile";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  LayoutTemplate,
  Users,
  CheckSquare,
  MessageSquare,
  UserCog,
  User as UserIcon,
  UserCheck,
  Lightbulb,
  Award,
  TrendingUp,
  Repeat,
  Mail,
  Briefcase,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  Factory,
  BadgeCheck,
  Truck,
  HeartPulse,
  Lock,
  Shield,
  Settings,
  FileCheck,
  CalendarClock
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAllModulePermissions } from "@/hooks/use-module-permissions";
import { Module } from "@shared/schema";

type LayoutProps = {
  children: React.ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isProcurementMenuOpen, setIsProcurementMenuOpen] = useState(false);
  const [isProductionMenuOpen, setIsProductionMenuOpen] = useState(false);
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);

  // Get all module permissions for the current user
  const { data: modulePermissions, isLoading: isLoadingPermissions } = useAllModulePermissions();

  // Check if we're on any project-related page
  const isOnProjectsPage = location.startsWith('/project') || 
                         location === '/customers' || 
                         location === '/item-master';
  
  // Check if we're on any procurement-related page
  const isOnProcurementPage = location === '/procurement-planning' ||
                            location === '/procurement-tracking';
  
  // Check if we're on any production-related page
  const isOnProductionPage = location === '/production-planning' ||
                           location === '/shop-floor';
                           
  // Check if we're on any quality-related page
  const isOnQualityPage = location === '/wps-pqr' ||
                        location === '/wps-pqr/wps' ||
                        location === '/wps-pqr/pqr' ||
                        location === '/welder-management' ||
                        location.startsWith('/quality/material-identification') ||
                        location === '/material-identification' ||
                        location === '/inspections' ||
                        location === '/inspection-management' ||
                        location.startsWith('/quality-reports') ||
                        location === '/quality-assurance-plan' ||
                        location === '/calibration-management' ||
                        location === '/template-management';
  
  // Auto-open menus based on current page
  useEffect(() => {
    if (isOnProjectsPage && !isProjectMenuOpen) {
      setIsProjectMenuOpen(true);
    }
    
    if (isOnProcurementPage && !isProcurementMenuOpen) {
      setIsProcurementMenuOpen(true);
    }
    
    if (isOnProductionPage && !isProductionMenuOpen) {
      setIsProductionMenuOpen(true);
    }
    
    if (isOnQualityPage && !isQualityMenuOpen) {
      setIsQualityMenuOpen(true);
    }
  }, [isOnProjectsPage, isOnProcurementPage, isOnProductionPage, isOnQualityPage]);

  // Helper function to check if a user has permission to view a module
  const hasViewPermission = (moduleName: Module) => {
    // If permissions are still loading, don't show anything yet
    if (isLoadingPermissions) {
      return false;
    }
    
    // If user is a Superuser, they have access to everything
    if (user?.role === "Superuser") {
      return true;
    }
    
    // Check if the user has view permission for this module
    return modulePermissions?.[moduleName]?.canView === true;
  };

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: CheckSquare, label: "Tasks", href: "/tasks" },
    { icon: Repeat, label: "Recurring Tasks", href: "/recurring-tasks" },
    ...(hasViewPermission("Project Management") ? [{ 
      icon: FolderKanban, 
      label: "Project Management", 
      isSubmenu: true,
      isOpen: isProjectMenuOpen,
      toggle: () => setIsProjectMenuOpen(!isProjectMenuOpen),
      children: [
        { icon: Briefcase, label: "Projects", href: "/projects" },
        { icon: Users, label: "Customers", href: "/customers" },
        { icon: TrendingUp, label: "Item Master", href: "/item-master" }
      ]
    }] : []),
    ...(hasViewPermission("Procurement Management") ? [{
      icon: TrendingUp,
      label: "Procurement Management",
      isSubmenu: true,
      isOpen: isProcurementMenuOpen,
      toggle: () => setIsProcurementMenuOpen(!isProcurementMenuOpen),
      children: [
        { icon: Briefcase, label: "Procurement Planning", href: "/procurement-planning" },
        { icon: TrendingUp, label: "Procurement Tracking", href: "/procurement-tracking" }
      ]
    }] : []),
    ...(hasViewPermission("Production Management") ? [{ 
      icon: Factory, 
      label: "Production Management", 
      isSubmenu: true,
      isOpen: isProductionMenuOpen,
      toggle: () => setIsProductionMenuOpen(!isProductionMenuOpen),
      children: [
        { icon: TrendingUp, label: "Production Planning", href: "/production-planning" },
        { icon: Briefcase, label: "Shop Floor", href: "/shop-floor" }
      ]
    }] : []),
    ...(hasViewPermission("Quality Management") ? [{ 
      icon: BadgeCheck, 
      label: "Quality Management", 
      isSubmenu: true,
      isOpen: isQualityMenuOpen,
      toggle: () => setIsQualityMenuOpen(!isQualityMenuOpen),
      children: [
        { icon: CalendarClock, label: "Calibration Management", href: "/calibration-management" },
        { icon: FileCheck, label: "WPS and PQR", href: "/wps-pqr-management" },
        { icon: FileCheck, label: "WPQR Documents", href: "/wpqr" },
        { icon: UserCheck, label: "Welder Management", href: "/welder-management" },
        { icon: CheckSquare, label: "Material Identification", href: "/quality/material-identification" },
        { icon: CheckSquare, label: "Inspections", href: "/inspections" },
        { icon: FileCheck, label: "Inspection Management", href: "/inspection-management" },
        { icon: Award, label: "Quality Reports", href: "/quality-reports" },
        { icon: FileCheck, label: "Quality Assurance Plan", href: "/quality-assurance-plan" },
        { icon: LayoutTemplate, label: "Template Management", href: "/template-management" }
      ]
    }] : []),
    ...(hasViewPermission("Project Commissioning") ? [{ icon: Briefcase, label: "Project Commissioning", href: "/project-commissioning" }] : []),
    ...(hasViewPermission("Dispatch & Shipping") ? [{ icon: Truck, label: "Dispatch & Shipping", href: "/dispatch-shipping" }] : []),
    ...(hasViewPermission("After-Sales") ? [{ icon: HeartPulse, label: "After-Sales", href: "/after-sales" }] : []),
    { icon: Users, label: "Team", href: "/team" },
    { icon: Lightbulb, label: "Recommendations", href: "/recommendations" },
    { icon: Award, label: "Leaderboard", href: "/leaderboard" },
    { icon: MessageSquare, label: "Messages", href: "/messages" },
    { icon: Mail, label: "Emails", href: "/emails" },
    ...(user?.role === "Superuser" ? [{ icon: Settings, label: "Diagnostics", href: "/tools" }] : []),
    { icon: UserIcon, label: "Profile", href: "/profile" },
    ...(user?.role === "Superuser" || user?.role === "General Manager" ? [
      { icon: UserCog, label: "User Management", href: "/users" },
      { icon: Users, label: "Password Management", href: "/password-management" },
      { icon: Shield, label: "Module Permissions", href: "/module-permissions" }
    ] : [])
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6">
          <div className="flex flex-col items-center mb-4">
            <img 
              src="/images/thermopac-logo.jpg" 
              alt="Thermopac Logo" 
              className="h-16 mb-2 object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                console.log("Logo image failed to load, using text fallback");
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const textLogo = document.createElement('div');
                  textLogo.className = 'text-2xl font-bold text-primary mb-2';
                  textLogo.textContent = 'THERMOPAC';
                  parent.appendChild(textLogo);
                }
              }}
            />
          </div>
          <UserProfile user={user!} />
        </div>
        <Separator />
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = item.href ? location === item.href : false;
              
              if (item.isSubmenu) {
                // Check if any child is active
                const isChildActive = item.children?.some(child => location === child.href);
                
                return (
                  <li key={`submenu-${index}`} className="space-y-1">
                    <button
                      onClick={item.toggle}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md transition-colors w-full text-left
                        ${isChildActive
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50 hover:text-accent-foreground'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    
                    {item.isOpen && (
                      <ul className="pl-5 space-y-1">
                        {item.children?.map((child, childIndex) => {
                          const ChildIcon = child.icon;
                          // Check if current location starts with child.href to handle query parameters
                          const isChildActive = child.href ? location.startsWith(child.href.split('?')[0]) : false;
                          // When we have exact match or for the case of query parameters - check full href match
                          const isExactMatch = location === child.href;
                          
                          return (
                            <li key={`${index}-${childIndex}`}>
                              <Link href={child.href || ''}>
                                <button
                                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-left
                                    ${isExactMatch || isChildActive
                                      ? 'bg-primary text-primary-foreground'
                                      : 'hover:bg-accent hover:text-accent-foreground'
                                    }`}
                                >
                                  <ChildIcon className="h-4 w-4" />
                                  <span>{child.label}</span>
                                </button>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              }
              
              return (
                <li key={item.href || `item-${index}`}>
                  {item.href && (
                    <Link href={item.href || ''}>
                      <button
                        className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-left
                          ${isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent hover:text-accent-foreground'
                          }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </button>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}