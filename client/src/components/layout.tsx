import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import UserProfile from "@/components/user-profile";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  MessageSquare,
  UserCog,
  User as UserIcon,
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
  BadgeCheck
} from "lucide-react";
import { useState } from "react";

type LayoutProps = {
  children: React.ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);

  // Check if we're on any project-related page
  const isOnProjectsPage = location.startsWith('/project') || 
                         location === '/customers' || 
                         location === '/item-master';
  
  // If we're on a project page, make sure the menu is open
  if (isOnProjectsPage && !isProjectMenuOpen) {
    setIsProjectMenuOpen(true);
  }

  // State for the newly added menus
  const [isProductionMenuOpen, setIsProductionMenuOpen] = useState(false);
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: CheckSquare, label: "Tasks", href: "/tasks" },
    { icon: Repeat, label: "Recurring Tasks", href: "/recurring-tasks" },
    { 
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
    },
    { 
      icon: Factory, 
      label: "Production Management", 
      isSubmenu: true,
      isOpen: isProductionMenuOpen,
      toggle: () => setIsProductionMenuOpen(!isProductionMenuOpen),
      children: [
        { icon: TrendingUp, label: "Production Planning", href: "/production-planning" },
        { icon: Briefcase, label: "Shop Floor", href: "/shop-floor" }
      ]
    },
    { 
      icon: BadgeCheck, 
      label: "Quality Management", 
      isSubmenu: true,
      isOpen: isQualityMenuOpen,
      toggle: () => setIsQualityMenuOpen(!isQualityMenuOpen),
      children: [
        { icon: CheckSquare, label: "Inspections", href: "/inspections" },
        { icon: Award, label: "Quality Reports", href: "/quality-reports" }
      ]
    },
    { icon: Users, label: "Team", href: "/team" },
    { icon: Lightbulb, label: "Recommendations", href: "/recommendations" },
    { icon: Award, label: "Leaderboard", href: "/leaderboard" },
    { icon: MessageSquare, label: "Messages", href: "/messages" },
    { icon: Mail, label: "Emails", href: "/emails" },
    { icon: UserIcon, label: "Profile", href: "/profile" },
    ...(user?.role === "Superuser" ? [
      { icon: UserCog, label: "User Management", href: "/users" },
      { icon: Users, label: "Password Management", href: "/password-management" }
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
                          const isChildActive = location === child.href;
                          
                          return (
                            <li key={`${index}-${childIndex}`}>
                              <Link href={child.href || ''}>
                                <button
                                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-left
                                    ${isChildActive
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