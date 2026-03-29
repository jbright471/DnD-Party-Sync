import { Home, UserPlus, Users, Shield, ScrollText, Eye, ClipboardList, BookOpen, Swords, Map, Download, Package, HelpCircle } from 'lucide-react';
import { NavLink } from './NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from './ui/sidebar';

const navItems = [
  { title: 'Dashboard', url: '/', icon: Home },
  { title: 'New Character', url: '/character/new', icon: UserPlus },
  { title: 'Import DDB', url: '/character/import', icon: Download },
  { title: 'Party Lobby', url: '/party', icon: Users },
  { title: 'Equipment', url: '/equipment', icon: Package },
  { title: 'Compendium', url: '/compendium', icon: ScrollText },
  { title: 'World Map', url: '/worldmap', icon: Map },
  { title: 'Guide', url: '/guide', icon: HelpCircle },
];

const dmItems = [
  { title: 'DM Dashboard', url: '/dm', icon: Eye },
  { title: 'Party Notes', url: '/notes', icon: ClipboardList },
  { title: 'Session Archive', url: '/archive', icon: BookOpen },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        <div className="p-4 flex items-center gap-2">
          <Swords className="h-6 w-6 text-primary shrink-0" />
          {!collapsed && (
            <h1 className="font-display text-lg font-bold text-primary tracking-wide">
              Arcane Ally
            </h1>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="font-display text-xs tracking-widest uppercase text-muted-foreground">
            {!collapsed && 'Navigation'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-secondary/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="font-display text-xs tracking-widest uppercase text-muted-foreground">
            {!collapsed && 'DM Tools'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dmItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-secondary/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
