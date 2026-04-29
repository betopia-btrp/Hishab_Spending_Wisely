/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
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
  const { isAuthenticated, loading, user } = useAuth();
  const { currentContext, loading: contextLoading } = useAppContext();
  const [showLogin, setShowLogin] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ name: string; code: string; id: string } | null>(null);
  const [showBudgetPopup, setShowBudgetPopup] = useState(false);
  const [pendingBudgetContextId, setPendingBudgetContextId] = useState<string | null>(null);
  const [budgetPopupMode, setBudgetPopupMode] = useState<'create' | 'update'>('create');
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const checkedContextIds = useRef<Set<string>>(new Set());

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const activeTab = searchParams.get('tab') || 'dashboard';

  const handleTabChange = useCallback((tab: string) => {
    router.push(`${pathname}?tab=${tab}`);
  }, [router, pathname]);

  // Show budget modal when:
  //   1. User just created a group (pendingBudgetContextId is set)
  //   2. User just logged in and a context is loaded for the first time
  useEffect(() => {
    if (!isAuthenticated) {
      checkedContextIds.current.clear();
      return;
    }

    // Path A: new group creation — show budget modal for the new group
    if (pendingBudgetContextId) {
      if (!checkedContextIds.current.has(pendingBudgetContextId)) {
        checkedContextIds.current.add(pendingBudgetContextId);
        if (currentContext && user?.id !== currentContext.owner_id) {
          // skip budget prompt for non-owner
        } else {
          const hasSetBudget = localStorage.getItem(`budget_set_${pendingBudgetContextId}`);
          if (!hasSetBudget) {
            setBudgetPopupMode('create');
            setShowBudgetPopup(true);
          }
        }
      }
      return;
    }

    // Path B: first time we see this context — check if budget needs prompting
    if (currentContext && !checkedContextIds.current.has(currentContext.id)) {
      checkedContextIds.current.add(currentContext.id);
      // Only prompt for budget if personal context or group owner
      if (currentContext.type === ContextType.GROUP && user?.id !== currentContext.owner_id) {
        // skip budget prompt for non-owner group members
      } else {
        const hasSetBudget = localStorage.getItem(`budget_set_${currentContext.id}`);
        if (!hasSetBudget) {
          setBudgetPopupMode('create');
          setShowBudgetPopup(true);
        }
      }
    }
  }, [isAuthenticated, pendingBudgetContextId, currentContext, contextLoading]);

  const handleBudgetSuccess = (contextId: string) => {
    localStorage.setItem(`budget_set_${contextId}`, 'true');
    window.dispatchEvent(new Event('budget-updated'));
    setShowBudgetPopup(false);
    setPendingBudgetContextId(null);
  };

  const handleCloseBudget = () => {
    setShowBudgetPopup(false);
    const contextId = pendingBudgetContextId || currentContext?.id;
    if (contextId) {
      localStorage.setItem(`budget_set_${contextId}`, 'skipped');
    }
    setPendingBudgetContextId(null);
  };

  const handleContextCreationComplete = (info?: { name: string; code: string; id: string }) => {
    if (info?.id && info.name && info.code) {
      setInviteInfo(info);
      setPendingBudgetContextId(info.id);
    } else {
      handleTabChange('dashboard');
    }
  };

  const handleCloseInviteModal = () => {
    const contextId = inviteInfo?.id;
    setInviteInfo(null);
    handleTabChange('dashboard');
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

  const getBudgetContextId = () => pendingBudgetContextId || currentContext?.id;

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
          mode={budgetPopupMode}
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