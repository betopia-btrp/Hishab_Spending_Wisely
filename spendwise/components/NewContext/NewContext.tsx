/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Hash, CheckCircle, Sparkles, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/axios';
import { useAppContext } from '@/contexts/AppContext';

export default function NewContext({ onComplete }: { onComplete: (info?: { name: string; code: string }) => void }) {
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshContexts } = useAppContext();

  const generateInviteCode = (): string => {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const code = generateInviteCode();
    try {
      await api.post('/contexts/groups', {
        name: groupName,
        invite_code: code
      });
      await refreshContexts();
      onComplete({ name: groupName, code });
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.plan?.[0] || err?.response?.data?.message || 'Failed to create group.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/contexts/join', {
        invite_code: inviteCode
      });
      await refreshContexts();
      onComplete();
    } catch (error) {
      console.error('Failed to join group', error);
      alert('Invalid or expired invite code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12">
      <div className="mb-12">
        <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">New Workspace</h2>
        <p className="text-slate-500 font-medium italic">Create a new container for shared finances or join an existing one.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Create Card */}
        <motion.div 
          whileHover={{ y: -5 }}
          onClick={() => { setMode('create'); setError(null); }}
          className={`relative p-10 rounded-[3rem] border-2 text-left transition-all overflow-hidden cursor-pointer ${
            mode === 'create' ? 'border-[#636B2F] bg-white ring-8 ring-[#636B2F]/5' : 'border-slate-100 bg-white hover:border-slate-200 shadow-xl shadow-slate-100'
          }`}
        >
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#636B2F] mb-8">
            <Plus size={32} />
          </div>
          <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Create Group</h3>
          <p className="text-slate-500 font-medium leading-relaxed mb-8">Launch a new shared context with custom rules and members.</p>
          
          {mode === 'create' && (
            <motion.form 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              onSubmit={handleCreateGroup} 
              className="space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <input 
                autoFocus
                type="text" 
                placeholder="Enter workspace name"
                value={groupName}
                onChange={e => { setGroupName(e.target.value); setError(null); }}
                required
                className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] font-bold"
              />

              {error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-red-700 font-medium">
                      <p>{error}</p>
                      {error.toLowerCase().includes('upgrade') && (
                        <Link
                          href="/pricing"
                          className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-[#636B2F] text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#4A5323] transition shadow-lg"
                        >
                          <Sparkles size={14} />
                          Upgrade to Pro
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button 
                disabled={loading}
                className="w-full bg-[#636B2F] text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-900/10 hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Launch Workspace'}
              </button>
            </motion.form>
          )}
        </motion.div>

        {/* Join Card */}
        <motion.div 
          whileHover={{ y: -5 }}
          onClick={() => setMode('join')}
          className={`relative p-10 rounded-[3rem] border-2 text-left transition-all overflow-hidden cursor-pointer ${
            mode === 'join' ? 'border-[#636B2F] bg-white ring-8 ring-[#636B2F]/5' : 'border-slate-100 bg-white hover:border-slate-200 shadow-xl shadow-slate-100'
          }`}
        >
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 mb-8">
            <Hash size={32} />
          </div>
          <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Join Group</h3>
          <p className="text-slate-500 font-medium leading-relaxed mb-8">Enter an 8-digit invite code to access an existing groupledger.</p>

          {mode === 'join' && (
            <motion.form 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              onSubmit={handleJoinGroup} 
              className="space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <input 
                autoFocus
                type="text" 
                maxLength={8}
                placeholder="00000000"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] font-bold text-center tracking-[0.3em]"
              />
              <button 
                disabled={loading}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Connect Now'}
              </button>
            </motion.form>
          )}
        </motion.div>
      </div>

      <div className="mt-12 p-8 rounded-[2rem] bg-emerald-50 border border-emerald-100 flex items-center gap-6">
        <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-[#636B2F]">
          <CheckCircle size={24} />
        </div>
        <div className="flex-1">
          <h4 className="font-black text-slate-900 tracking-tight">Security Protocol</h4>
          <p className="text-sm text-slate-600 font-medium">Invite codes are unique and grant member-level access. Admin roles can be delegated after joining.</p>
        </div>
        <button 
          onClick={() => onComplete()}
          className="text-slate-400 hover:text-slate-600 font-black text-xs uppercase tracking-widest"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}