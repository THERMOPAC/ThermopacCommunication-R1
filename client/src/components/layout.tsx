import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import UserProfile from "@/components/user-profile";
import AttendanceGatekeeper from "@/components/attendance-gatekeeper";
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
  CalendarClock,
  BarChart4,
  BarChart3,
  UsersRound,
  Megaphone,
  Receipt,
  IndianRupee,
  CreditCard,
  PieChart,
  DollarSign,
  Palette,
  FileText
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
  const [isSalesAndMarketingMenuOpen, setIsSalesAndMarketingMenuOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isProcurementMenuOpen, setIsProcurementMenuOpen] = useState(false);
  const [isProductionMenuOpen, setIsProductionMenuOpen] = useState(false);
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const [isFinanceMenuOpen, setIsFinanceMenuOpen] = useState(false);
  const [attendanceCheckCompleted, setAttendanceCheckCompleted] = useState(false);

  // Get all module permissions for the current user
  const { data: modulePermissions, isLoading: isLoadingPermissions } = useAllModulePermissions();

  // Check if we're on any sales and marketing related page
  const isOnSalesAndMarketingPage = location === '/leads' ||
                                  location === '/campaigns' ||
                                  location === '/marketing-dashboard';
  
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
                        location.startsWith('/quality-reports') ||
                        location === '/quality-assurance-plan' ||
                        location === '/calibration-management' ||
                        location === '/template-management';
                        
  // Check if we're on any finance-related page
  const isOnFinancePage = location === '/finance' ||
                        location === '/finance/dashboard' ||
                        location === '/finance/invoices' ||
                        location === '/finance/payments' ||
                        location.startsWith('/finance/reports') ||
                        location === '/finance/brc';
  
  // Auto-open menus based on current page
  useEffect(() => {
    if (isOnSalesAndMarketingPage && !isSalesAndMarketingMenuOpen) {
      setIsSalesAndMarketingMenuOpen(true);
    }
    
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
    
    if (isOnFinancePage && !isFinanceMenuOpen) {
      setIsFinanceMenuOpen(true);
    }
  }, [isOnSalesAndMarketingPage, isOnProjectsPage, isOnProcurementPage, isOnProductionPage, isOnQualityPage, isOnFinancePage]);

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
    ...(hasViewPermission("Sales and Marketing") ? [{ 
      icon: Megaphone, 
      label: "Sales and Marketing", 
      isSubmenu: true,
      isOpen: isSalesAndMarketingMenuOpen,
      toggle: () => setIsSalesAndMarketingMenuOpen(!isSalesAndMarketingMenuOpen),
      children: [
        { icon: UsersRound, label: "Leads", href: "/leads" },
        { icon: BarChart4, label: "Marketing Dashboard", href: "/marketing-dashboard" },
        { icon: TrendingUp, label: "Campaigns", href: "/campaigns" }
      ]
    }] : []),
    ...(hasViewPermission("Finance") ? [{ 
      icon: IndianRupee, 
      label: "Finance", 
      isSubmenu: true,
      isOpen: isFinanceMenuOpen,
      toggle: () => setIsFinanceMenuOpen(!isFinanceMenuOpen),
      children: [
        { icon: PieChart, label: "Dashboard", href: "/finance/dashboard" },
        { icon: Receipt, label: "Invoices", href: "/finance/invoices" },
        { icon: CreditCard, label: "Payments", href: "/finance/payments" },
        { icon: DollarSign, label: "Payment Allocation", href: "/finance/payment-allocation" },
        { icon: BarChart4, label: "Financial Reconciliation", href: "/finance/reports/reconciliation" },
        { icon: TrendingUp, label: "Turnover Report", href: "/finance/reports/turnover" },
        { icon: PieChart, label: "Outstanding Report", href: "/finance/reports/outstanding" },
        { icon: BarChart4, label: "Invoice Aging Dashboard", href: "/finance/reports/invoice-aging" },
        { icon: FileCheck, label: "Write-off Management", href: "/finance/write-offs" },
        { icon: CreditCard, label: "Inward Remittances", href: "/finance/reports/remittances" },
        { icon: DollarSign, label: "BRC Management", href: "/finance/brc-management" },
        { icon: Settings, label: "Finance Tools", href: "/finance/tools" }
      ]
    }] : []),
    ...(hasViewPermission("Project Management") ? [{ 
      icon: FolderKanban, 
      label: "Project Management", 
      isSubmenu: true,
      isOpen: isProjectMenuOpen,
      toggle: () => setIsProjectMenuOpen(!isProjectMenuOpen),
      children: [
        { icon: BarChart4, label: "Project Dashboard", href: "/project-dashboard" },
        { icon: Briefcase, label: "Projects", href: "/projects" },
        { icon: Users, label: "Customers", href: "/customers" },
        { icon: TrendingUp, label: "Item Master", href: "/item-master" },
        { icon: Palette, label: "Design Tools", href: "/design-tools" }
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
        { icon: Briefcase, label: "Shop Floor", href: "/shop-floor" },
        { icon: FileText, label: "Daily Production Report", href: "/daily-production-report" }
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
        { icon: FileCheck, label: "WPQR Documents", href: "/wpqr" },
        { icon: UserCheck, label: "Welder Management", href: "/welder-management" },
        { icon: CheckSquare, label: "Material Identification", href: "/quality/material-identification" },
        { icon: CheckSquare, label: "Inspections", href: "/inspections" },
        { icon: FileCheck, label: "Quality Assurance Plan", href: "/quality-assurance-plan" },
        { icon: LayoutTemplate, label: "Template Management", href: "/template-management" }
      ]
    }] : []),
    ...(hasViewPermission("Project Commissioning") ? [{ icon: Briefcase, label: "Project Commissioning", href: "/project-commissioning" }] : []),
    ...(hasViewPermission("Dispatch & Shipping") ? [{ icon: Truck, label: "Dispatch & Shipping", href: "/dispatch-shipping" }] : []),
    ...(hasViewPermission("After-Sales") ? [{ icon: HeartPulse, label: "After-Sales", href: "/after-sales" }] : []),
    { icon: MessageSquare, label: "Messages", href: "/messages" },
    { icon: Users, label: "Team", href: "/team" },
    ...(user?.role === "Superuser" ? [{ icon: Factory, label: "Work Locations", href: "/work-locations" }] : []),
    { icon: CalendarClock, label: "Attendance", href: "/attendance" },
    { icon: FileText, label: "Daily Work Report", href: "/dwar" },
    { icon: IndianRupee, label: "Payroll", href: "/payroll" },
    { icon: Lightbulb, label: "Recommendations", href: "/recommendations" },
    { icon: Award, label: "Leaderboard", href: "/leaderboard" },
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
    <div className="min-h-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[250px] min-w-[250px] border-r bg-white flex flex-col shadow-sm">
        <div className="p-6 border-b">
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
                  textLogo.className = 'text-2xl font-bold text-[#3B82F6] mb-2';
                  textLogo.textContent = 'THERMOPAC';
                  parent.appendChild(textLogo);
                }
              }}
            />
          </div>
          <UserProfile user={user!} />
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Dashboard Section */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 px-3">Main</h3>
              <ul className="space-y-1">
                {menuItems.filter(item => !item.isSubmenu && (item.href === '/attendance' || item.href === '/' || item.href === '/tasks' || item.href === '/recurring-tasks' || item.href === '/messages')).map((item, index) => {
                  const Icon = item.icon;
                  const isActive = item.href ? location === item.href : false;
                  
                  return (
                    <li key={item.href || `item-${index}`}>
                      {item.href && (
                        <Link href={item.href || ''}>
                          <button
                            className={`flex items-center gap-3 px-3 py-2 w-full text-left text-[#3B82F6] transition-all
                              ${isActive
                                ? 'bg-[#E0F2FE] border-l-4 border-[#3B82F6] pl-2 font-semibold'
                                : 'hover:bg-[#F3F4F6] rounded-md'
                              }`}
                          >
                            <Icon className={`h-5 w-5 ${isActive ? 'text-[#3B82F6]' : 'text-[#3B82F6]'}`} />
                            <span>{item.label}</span>
                          </button>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            
            {/* Modules Section */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 px-3">Modules</h3>
              <ul className="space-y-1">
                {/* Show submenu items */}
                {menuItems.filter(item => item.isSubmenu).map((item, index) => {
                  const Icon = item.icon;
                  // Check if any child is active
                  const isChildActive = item.children?.some(child => location.startsWith(child.href?.split('?')[0] || ''));
                  
                  return (
                    <li key={`submenu-${index}`} className="space-y-1">
                      <button
                        onClick={item.toggle}
                        className={`flex items-center justify-between gap-3 px-3 py-2 w-full text-left text-[#3B82F6] transition-colors rounded-md
                          ${isChildActive ? 'bg-[#E0F2FE] font-semibold' : 'hover:bg-[#F3F4F6]'}`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`h-5 w-5 ${isChildActive ? 'text-[#3B82F6]' : 'text-[#3B82F6]'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.isOpen ? (
                          <ChevronDown className="h-4 w-4 text-[#3B82F6]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[#3B82F6]" />
                        )}
                      </button>
                      
                      {item.isOpen && (
                        <ul className="pl-10 space-y-1 mt-1">
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
                                    className={`flex items-center gap-3 px-3 py-2 w-full text-left text-[#EF4444] transition-colors
                                      ${isExactMatch || isChildActive
                                        ? 'bg-[#E0F2FE] border-l-4 border-[#3B82F6] pl-2 font-semibold rounded-r-md'
                                        : 'hover:bg-[#F3F4F6] rounded-md'
                                      }`}
                                  >
                                    <ChildIcon className={`h-4 w-4 ${isExactMatch || isChildActive ? 'text-[#EF4444]' : 'text-[#EF4444]'}`} />
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
                })}
                
                {/* Show individual module items (non-submenu) */}
                {menuItems.filter(item => 
                  !item.isSubmenu && 
                  (item.href === '/project-commissioning' || 
                   item.href === '/dispatch-shipping' || 
                   item.href === '/after-sales')
                ).map((item, index) => {
                  const Icon = item.icon;
                  const isActive = item.href ? location === item.href : false;
                  
                  return (
                    <li key={item.href || `module-${index}`}>
                      {item.href && (
                        <Link href={item.href || ''}>
                          <button
                            className={`flex items-center gap-3 px-3 py-2 w-full text-left text-[#3B82F6] transition-all
                              ${isActive
                                ? 'bg-[#E0F2FE] border-l-4 border-[#3B82F6] pl-2 font-semibold'
                                : 'hover:bg-[#F3F4F6] rounded-md'
                              }`}
                          >
                            <Icon className={`h-5 w-5 ${isActive ? 'text-[#3B82F6]' : 'text-[#3B82F6]'}`} />
                            <span>{item.label}</span>
                          </button>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            
            {/* General Section */}
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 px-3">General</h3>
              <ul className="space-y-1">
                {menuItems.filter(item => 
                  item.href === '/team' || 
                  item.href === '/work-locations' || 
                  item.href === '/dwar' || 
                  item.href === '/payroll' || 
                  item.href === '/recommendations' || 
                  item.href === '/leaderboard' || 
                  item.href === '/emails'
                ).map((item, index) => {
                  const Icon = item.icon;
                  const isActive = item.href ? location === item.href : false;
                  
                  return (
                    <li key={item.href || `general-${index}`}>
                      {item.href && (
                        <Link href={item.href || ''}>
                          <button
                            className={`flex items-center gap-3 px-3 py-2 w-full text-left text-[#3B82F6] transition-colors
                              ${isActive
                                ? 'bg-[#E0F2FE] border-l-4 border-[#3B82F6] pl-2 font-semibold'
                                : 'hover:bg-[#F3F4F6] rounded-md'
                              }`}
                          >
                            <Icon className={`h-5 w-5 ${isActive ? 'text-[#3B82F6]' : 'text-[#3B82F6]'}`} />
                            <span>{item.label}</span>
                          </button>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            
            {/* Admin Section */}
            {(user?.role === "Superuser" || user?.role === "General Manager") && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 px-3">Administration</h3>
                <ul className="space-y-1">
                  {menuItems.slice(-3).map((item, index) => {
                    const Icon = item.icon;
                    const isActive = item.href ? location === item.href : false;
                    
                    return (
                      <li key={item.href || `admin-${index}`}>
                        {item.href && (
                          <Link href={item.href || ''}>
                            <button
                              className={`flex items-center gap-3 px-3 py-2 w-full text-left text-[#3B82F6] transition-colors
                                ${isActive
                                  ? 'bg-[#E0F2FE] border-l-4 border-[#3B82F6] pl-2 font-semibold'
                                  : 'hover:bg-[#F3F4F6] rounded-md'
                                }`}
                            >
                              <Icon className={`h-5 w-5 ${isActive ? 'text-[#3B82F6]' : 'text-[#3B82F6]'}`} />
                              <span>{item.label}</span>
                            </button>
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-x-hidden">
        <div className="max-w-[calc(100vw-260px)] mx-auto">
          <AttendanceGatekeeper onAccessGranted={() => setAttendanceCheckCompleted(true)}>
            {children}
          </AttendanceGatekeeper>
        </div>
      </main>
    </div>
  );
}