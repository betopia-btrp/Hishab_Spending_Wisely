/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAppContext } from '@/contexts/AppContext';
import Layout from '@/components/Layout';
import Login from '@/components/Login';
import Dashboard from '@/components/Dashboard';
import Expenses from '@/components/(Expenses)/Expenses';
import Balances from '@/components/(Balances)/Balances';
import Budgets from '@/components/(Budgets)/Budgets';
import LandingPage from '@/components/LandingPage';
import BudgetModal from '@/components/(Budgets)/BudgetModal';
import NewContext from '@/components/(NewContext)/NewContext';
import InviteCodeModal from '@/components/(NewContext)/InviteCodeModal';
import { ContextType } from '@/types';

const Reminders = () => (
  <div className="bg-white p-12 rounded-[2rem] border border-slate-100 flex flex-col items-center justify-center text-center text-slate-400 italic shadow-xl shadow-slate-100">
     <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6 grayscale opacity-50">
        <span className="text-3xl">🔔</span>
     </div>
    <p className="font-bold text-sm uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full">Coming in Phase 2</p>
    <p className="mt-4 text-slate-400">Contextual alerts and smart settlement prompts.</p>
  </div>
);

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const { currentContext, loading: contextLoading } = useAppContext();
  const [showLogin, setShowLogin] = useState(false);
  const [showBudgetPopup, setShowBudgetPopup] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ name: string; code: string; id: string } | null>(null);
  const [pendingBudgetContextId, setPendingBudgetContextId] = useState<string | null>(null);
  
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const activeTab = searchParams.get('tab') || 'dashboard';

  const handleTabChange = useCallback((tab: string) => {
    router.push(`${pathname}?tab=${tab}`);
  }, [router, pathname]);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Check pending context first (from new group creation or join)
    if (pendingBudgetContextId) {
      const hasSetBudget = localStorage.getItem(`budget_set_${pendingBudgetContextId}`);
      if (!hasSetBudget) {
        setShowBudgetPopup(true);
      }
      // Clear the pending context after checking
      setPendingBudgetContextId(null);
      return;
    }
    
    // Fall back to current context
    if (currentContext) {
      const hasSetBudget = localStorage.getItem(`budget_set_${currentContext.id}`);
      if (!hasSetBudget) {
        setShowBudgetPopup(true);
      }
    }
  }, [isAuthenticated, currentContext, pendingBudgetContextId]);

  const handleCloseBudget = () => {
    setShowBudgetPopup(false);
  };

  const handleBudgetSuccess = (contextId: string) => {
    localStorage.setItem(`budget_set_${contextId}`, 'true');
    window.dispatchEvent(new Event('budget-updated'));
  };

const handleContextCreationComplete = (info?: { name: string; code: string; id: string }) => {
    // If info has valid id and name, it's a new group - show invite modal
    if (info?.id && info.name && info.code) {
      setInviteInfo(info);
    } else if (info?.id) {
      // Joined group - set pending context for budget check
      setPendingBudgetContextId(info.id);
      handleTabChange('dashboard');
    } else {
      handleTabChange('dashboard');
    }
  };

  const handleCloseInviteModal = () => {
    const contextId = inviteInfo?.id;
    setInviteInfo(null);
    handleTabChange('dashboard');
    // After dismissing invite modal, show budget popup for the new group
    if (contextId) {
      setPendingBudgetContextId(contextId);
    }
  };

  if (loading || (isAuthenticated && contextLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-[6px] border-[#636B2F]/10 border-t-[#636B2F] rounded-full animate-spin mb-6 shadow-xl shadow-emerald-500/5 transition-all" />
          <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">Syncing with Ledger</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !showLogin) {
    return <LandingPage onGetStarted={() => setShowLogin(true)} />;
  }

  if (!isAuthenticated && showLogin) {
    return <Login />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'expenses': return <Expenses />;
      case 'balances': return <Balances />;
      case 'budgets': return <Budgets />;
      case 'reminders': return <Reminders />;
      case 'new-context': return <NewContext onComplete={handleContextCreationComplete} />;
      default: return <Dashboard />;
    }
  };

  const getBudgetContextId = () => {
    if (pendingBudgetContextId) {
      return pendingBudgetContextId;
    }
    return currentContext?.id;
  };

  return (
    <Layout activeTab={activeTab} onTabChange={handleTabChange}>
      {renderContent()}
      
      {inviteInfo && (
        <InviteCodeModal 
          groupName={inviteInfo.name} 
          code={inviteInfo.code}
          contextId={inviteInfo.id}
          onClose={handleCloseInviteModal} 
        />
      )}

      {showBudgetPopup && getBudgetContextId() && (
        <BudgetModal 
          contextId={getBudgetContextId()!} 
          onClose={handleCloseBudget}
          onSuccess={() => handleBudgetSuccess(getBudgetContextId()!)}
        />
      )}
    </Layout>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-[#636B2F]/20 border-t-[#636B2F] rounded-full animate-spin" />
      </div>
    }>
      <AppContent />
    </Suspense>
  );
}