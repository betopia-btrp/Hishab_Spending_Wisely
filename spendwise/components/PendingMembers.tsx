/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState, useEffect } from 'react';
import { Users, Check, X, Clock } from 'lucide-react';
import api from '@/lib/axios';
import { useAppContext } from '@/contexts/AppContext';

interface PendingMember {
  id: string;
  user_id: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
  };
  status: string;
  role: string;
  created_at: string;
}

interface PendingMembersProps {
  contextId: string;
  onUpdate?: () => void;
}

export default function PendingMembers({ contextId, onUpdate }: PendingMembersProps) {
  const { currentContext, user: currentUser } = useAppContext();
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const isAdmin = currentContext?.current_member?.role === 'admin';

  const fetchPendingMembers = async () => {
    if (!currentContext) return;
    setLoading(true);
    try {
      const res = await api.get(`/contexts/${currentContext.id}`);
      const pending = res.data.pending_members || [];
      setPendingMembers(pending);
    } catch (err) {
      console.error('Failed to fetch pending members', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentContext && isAdmin) {
      fetchPendingMembers();
    }
  }, [currentContext, isAdmin]);

  const handleApprove = async (memberId: string) => {
    if (!currentContext) return;
    setProcessing(memberId);
    try {
      await api.post(`/contexts/${currentContext.id}/approve/${memberId}`);
      setPendingMembers(prev => prev.filter(m => m.id !== memberId));
      onUpdate?.();
    } catch (err) {
      console.error('Failed to approve member', err);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (memberId: string) => {
    if (!currentContext) return;
    setProcessing(memberId);
    try {
      await api.delete(`/contexts/${currentContext.id}/members/${memberId}`);
      setPendingMembers(prev => prev.filter(m => m.id !== memberId));
      onUpdate?.();
    } catch (err) {
      console.error('Failed to reject member', err);
    } finally {
      setProcessing(null);
    }
  };

  if (!isAdmin) return null;
  if (loading || pendingMembers.length === 0) return null;

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
          <Users size={20} className="text-amber-600" />
        </div>
        <div>
          <h3 className="font-black text-slate-900">Pending Requests</h3>
          <p className="text-xs text-slate-500">{pendingMembers.length} member(s) waiting for approval</p>
        </div>
      </div>

      <div className="space-y-3">
        {pendingMembers.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-black text-emerald-600">
                {member.user?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-900">{member.user?.name}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(member.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(member.id)}
                disabled={processing === member.id}
                className="p-2 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition"
                title="Approve"
              >
                {processing === member.id ? (
                  <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                ) : (
                  <Check size={16} className="text-emerald-600" />
                )}
              </button>
              <button
                onClick={() => handleReject(member.id)}
                disabled={processing === member.id}
                className="p-2 bg-rose-100 hover:bg-rose-200 rounded-xl transition"
                title="Reject"
              >
                <X size={16} className="text-rose-600" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}