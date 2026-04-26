/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState, ReactNode, useEffect } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import Tutorial from './Tutorial';
import { cn } from '@/lib/utils';

export default function Layout({ 
  children, 
  activeTab, 
  onTabChange 
}: { 
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('tutorial_seen');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
    }
  }, []);

  const handleCloseTutorial = () => {
    localStorage.setItem('tutorial_seen', 'true');
    setShowTutorial(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={onTabChange} 
        collapsed={collapsed} 
        setCollapsed={setCollapsed} 
      />
      
      <main className={cn(
        "flex-1 flex flex-col transition-all duration-300",
        collapsed ? "ml-20" : "ml-64"
      )}>
        <Navbar />
        <div className="p-8 lg:p-12 max-w-[1600px] mx-auto w-full">
          {children}
        </div>
      </main>

      {showTutorial && <Tutorial onClose={handleCloseTutorial} />}
    </div>
  );
}
