/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { 
  LayoutDashboard, 
  Receipt, 
  Wallet, 
  Target, 
  Bell, 
  Settings, 
  Plus,
  Users,
  User as UserIcon,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { ContextType } from '@/types';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export default function Sidebar({ activeTab, onTabChange, collapsed, setCollapsed }: SidebarProps) {
  const { currentContext, availableContexts, switchContext } = useAppContext();
  const { logout } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'budgets', label: 'Budgets', icon: Target },
    { id: 'reminders', label: 'Reminders', icon: Bell },
  ];

  return (
    <aside 
      className={cn(
        "bg-white border-r border-slate-200 transition-all duration-300 flex flex-col h-screen fixed left-0 top-0 z-30 shadow-sm",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="p-8 pb-4 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2 text-[#636B2F]">
            <div className="w-8 h-8 bg-[#636B2F] rounded-lg flex items-center justify-center text-white">
              <Wallet size={16} />
            </div>
            <span className="font-extrabold text-xl text-slate-900 tracking-tighter">SpendWise</span>
          </div>
        )}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className={cn("p-1.5 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100", collapsed && "mx-auto")}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 custom-scrollbar">
        {/* Navigation Tutorial Tooltip */}
        {!collapsed && availableContexts.length > 0 && (
          <div className="mb-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-1">
              <div className="w-2 h-2 bg-[#636B2F] rounded-full animate-ping" />
            </div>
            <p className="text-[10px] font-black text-[#636B2F] uppercase tracking-widest mb-1">Navigation Guide</p>
            <p className="text-xs text-slate-600 leading-tight">Switch between personal and group ledgers here to isolate spending analytics.</p>
          </div>
        )}

        <label className={cn("text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block px-2", collapsed && "sr-only")}>
          Workspace
        </label>
        <div className="space-y-1 mb-8">
          {Array.isArray(availableContexts) && availableContexts.map((context) => (
            <button
              key={context.id}
              onClick={() => switchContext(context.id)}
              className={cn(
                "w-full flex items-center p-3 rounded-2xl transition-all duration-200 group relative",
                currentContext?.id === context.id 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
              title={context.name}
            >
              <div className={cn(
                "flex items-center justify-center",
                currentContext?.id === context.id ? "text-[#636B2F]" : "group-hover:text-[#636B2F]"
              )}>
                {context.type === ContextType.PERSONAL ? <UserIcon size={20} /> : <Users size={20} />}
              </div>
              {!collapsed && (
                <span className="ml-3 truncate flex-1 text-left font-bold text-sm tracking-tight">{context.name}</span>
              )}
              {!collapsed && currentContext?.id === context.id && (
                <div className="w-1.5 h-1.5 bg-[#636B2F] rounded-full animate-pulse" />
              )}
            </button>
          ))}
          {!collapsed && (
            <button 
              onClick={() => onTabChange('new-context')}
              className="w-full flex items-center p-3 mt-2 text-slate-400 hover:text-[#636B2F] hover:bg-emerald-50 rounded-2xl transition-all text-xs font-bold border border-dashed border-slate-200"
            >
              <Plus size={16} />
              <span className="ml-2 uppercase tracking-widest">New Context</span>
            </button>
          )}
        </div>

        <label className={cn("text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block px-2", collapsed && "sr-only")}>
          Main Menu
        </label>
        <nav className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-full flex items-center p-3 rounded-2xl transition-all group",
                activeTab === item.id 
                  ? "bg-emerald-50 text-[#636B2F]" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon size={20} className={cn("transition-transform group-hover:scale-110", activeTab === item.id && "scale-110")} />
              {!collapsed && <span className="ml-3 font-bold text-sm tracking-tight">{item.label}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <button 
          className="w-full flex items-center p-3 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-2xl transition-all font-bold text-sm"
          onClick={logout}
        >
          <LogOut size={20} />
          {!collapsed && <span className="ml-3">Log out</span>}
        </button>
      </div>
    </aside>
  );
}
