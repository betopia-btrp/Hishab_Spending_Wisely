/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle, Send, Receipt, Users, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/axios';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Balance } from '@/types';

export default function Balances() {
  const { currentContext } = useAppContext();
  const { user } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalances = async () => {
      if (!currentContext) return;
      setLoading(true);
      try {
        const res = await api.get(`/auth/balances/summary?context_id=${currentContext.id}`);
        setBalances(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchBalances();
  }, [currentContext]);

  const totalOwed = balances
    .filter(b => b.to_user_id === user?.id)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalIOwe = balances
    .filter(b => b.from_user_id === user?.id)
    .reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Settlements Hub</h2>
          <p className="text-sm text-slate-500 font-medium">Reconcile debts and view outstanding balances</p>
        </div>
        <button className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-extrabold shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2">
          <Send size={18} />
          Record Payment
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Receivable</span>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
                 <TrendingUp size={24} />
              </div>
            </div>
            <p className="text-5xl font-black text-emerald-600 tracking-tighter">{formatCurrency(totalOwed)}</p>
            <div className="mt-8 flex items-center gap-2 bg-emerald-50 w-fit px-3 py-1 rounded-lg">
               <Users size={12} className="text-emerald-600" />
               <p className="text-[10px] text-emerald-700 font-black uppercase tracking-widest">From {balances.filter(b => b.to_user_id === user?.id).length} peers</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Payable</span>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
                 <TrendingDown size={24} />
              </div>
            </div>
            <p className="text-5xl font-black text-rose-600 tracking-tighter">{formatCurrency(totalIOwe)}</p>
            <div className="mt-8 flex items-center gap-2 bg-rose-50 w-fit px-3 py-1 rounded-lg">
               <Users size={12} className="text-rose-600" />
               <p className="text-[10px] text-rose-700 font-black uppercase tracking-widest">To {balances.filter(b => b.from_user_id === user?.id).length} peers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
         <div className="flex items-center gap-4">
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Peer Breakdown</h3>
            <div className="h-px flex-1 bg-slate-100"></div>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">Calculating net positions...</div>
            ) : balances.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
                 <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} />
                 </div>
                 <p className="text-slate-500 font-bold">Ledger is clean. Everyone is settled! 🎉</p>
              </div>
            ) : (
              balances.map((balance, i) => {
                const isIOWe = balance.from_user_id === user?.id;
                const otherUser = isIOWe ? balance.to_user : balance.from_user;
                
                return (
                  <div key={i} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between transition-all hover:shadow-xl hover:shadow-slate-200/50 hover:scale-[1.02] group">
                    <div className="flex items-center space-x-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center font-black text-slate-400 border border-slate-100 shadow-sm uppercase text-lg group-hover:from-blue-600 group-hover:to-blue-700 group-hover:text-white group-hover:border-transparent transition-all">
                        {otherUser?.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-extrabold text-slate-900 tracking-tight">{otherUser?.name}</p>
                        <p className={cn("text-[9px] font-black uppercase tracking-[0.15em]", isIOWe ? "text-rose-500" : "text-emerald-500")}>
                          {isIOWe ? 'Net Debt' : 'Net Credit'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className={cn("text-xl font-black tracking-tighter", isIOWe ? "text-rose-600" : "text-emerald-600")}>
                         {formatCurrency(balance.amount)}
                       </p>
                       <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest group-hover:underline mt-1 transition-all">Settle Now</button>
                    </div>
                  </div>
                );
              })
            )}
         </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-10 mt-12 relative overflow-hidden">
         <div className="absolute -bottom-10 -right-10 opacity-[0.03] rotate-12">
            <Receipt size={200} className="text-slate-900" />
         </div>
         <div className="relative z-10">
           <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Recent Settlement Reports</h3>
                <p className="text-sm text-slate-500">Historical record of all payments made between users</p>
              </div>
              <button className="px-5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black text-slate-600 uppercase tracking-widest hover:bg-slate-100 transition shadow-sm">Audit Full Log</button>
           </div>
           <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 opacity-50">
                <Receipt size={32} />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em] opacity-40">Zero historical records found</p>
           </div>
         </div>
      </div>
    </div>
  );
}
