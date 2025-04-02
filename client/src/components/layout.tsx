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
  Repeat
} from "lucide-react";

type LayoutProps = {
  children: React.ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const [location] = useLocation();

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: CheckSquare, label: "Tasks", href: "/tasks" },
    { icon: Repeat, label: "Recurring Tasks", href: "/recurring-tasks" },
    { icon: Users, label: "Team", href: "/team" },
    { icon: Lightbulb, label: "Recommendations", href: "/recommendations" },
    { icon: Award, label: "Leaderboard", href: "/leaderboard" },
    { icon: MessageSquare, label: "Messages", href: "/messages" },
    { icon: UserIcon, label: "Profile", href: "/profile" },
    ...(user?.role === "Superuser" ? [
      { icon: UserCog, label: "User Management", href: "/users" }
    ] : [])
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">THERMOPAC</h2>
          <UserProfile user={user!} />
        </div>
        <Separator />
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <li key={item.href}>
                  <Link href={item.href}>
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