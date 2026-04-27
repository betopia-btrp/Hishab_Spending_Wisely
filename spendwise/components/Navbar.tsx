/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Search, Bell, Menu, User as UserIcon, Keyboard, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function Navbar() {
  const { currentContext } = useAppContext();
  const { user } = useAuth();

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-20 transition-all">
      <div className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center space-x-6">
          <button className="md:hidden p-2 hover:bg-slate-100 rounded-xl transition">
            <Menu size={20} />
          </button>
          <div className="hidden lg:flex items-center bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl w-80 group focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white transition-all">
            <Search size={16} className="text-slate-400 group-focus-within:text-blue-500" />
            <input 
              type="text" 
              placeholder="Search everything..." 
              className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-full font-medium placeholder:text-slate-400"
            />
            <div className="bg-white border border-slate-200 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-400 flex items-center gap-1 shadow-sm">
              <Keyboard size={10} />
              <span>/</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex flex-col items-end mr-4">
             <span className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Live Context</span>
             <span className="text-sm font-extrabold text-[#636B2F] tracking-tight">{currentContext?.name || 'Syncing...'}</span>
          </div>
          
          <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block"></div>
          
          <button className="p-2.5 text-slate-500 hover:bg-slate-50 rounded-xl relative transition group">
            <Bell size={20} className="group-hover:rotate-12 transition-transform" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-[#636B2F] rounded-full border-2 border-white"></span>
          </button>
          
          <div className="flex items-center space-x-4 pl-4 ml-1">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900 tracking-tight">{user?.name}</span>
              {user?.is_premium ? (
                <span className="text-[9px] bg-emerald-100 text-[#636B2F] px-2 py-0.5 rounded-full font-black uppercase tracking-widest shadow-sm shadow-emerald-100 flex items-center gap-1">
                  <Sparkles size={9} /> Pro
                </span>
              ) : (
                <Link href="/pricing" className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase tracking-widest hover:bg-[#636B2F] hover:text-white transition-all">
                  Free
                </Link>
              )}
            </div>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#636B2F] to-[#4A5323] flex items-center justify-center text-white font-black border-4 border-white shadow-xl shadow-emerald-100 overflow-hidden text-lg ring-1 ring-slate-100">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span>{user?.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
