import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { ErrorBoundary } from '../ErrorBoundary';

import {
  LayoutDashboard,
  Database,
  Globe,
  Server,
  Settings,
  Activity,
  LogOut,
  User,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Subscriptions', href: '/subscriptions', icon: Database },
  { name: 'Online Services', href: '/online-services', icon: Globe },
  { name: 'Servers', href: '/servers', icon: Server },
  { name: 'Scanner Settings', href: '/settings', icon: Settings },
  { name: 'AnyCast', href: '/anycast', icon: Activity },
];

export function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-card">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <span className="text-xl font-bold">mglaroute</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-4">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 h-10">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium truncate">{user?.username || 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">Administrator</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuItem className="cursor-default" disabled>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="ml-64 min-h-screen">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center gap-4 border-b px-6">
            <h1 className="text-xl font-semibold">{location.pathname === '/' ? 'Dashboard' : location.pathname.slice(1)}</h1>
          </div>
        </header>
        <div className="p-6">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}