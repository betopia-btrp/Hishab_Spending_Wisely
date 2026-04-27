/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { motion } from 'motion/react';
import { Copy, Check, ArrowRight, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

interface InviteCodeModalProps {
  groupName: string;
  code: string;
  contextId: string;
  onClose: () => void;
}

export default function InviteCodeModal({ groupName, code, contextId, onClose }: InviteCodeModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
      >
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#636B2F] mx-auto mb-6">
            <ShieldCheck size={40} />
          </div>

          <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Group Created!</h3>
          <p className="text-slate-500 font-medium mb-6">
            Share this code with members to invite them to <span className="text-[#636B2F] font-bold">{groupName}</span>
          </p>

          <div 
            className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 mb-6 cursor-pointer hover:border-[#636B2F] transition-colors"
            onClick={handleCopy}
          >
            <span className="text-4xl font-black tracking-[0.2em] text-slate-900 block">{code}</span>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-2">
              {copied ? 'Copied!' : 'Click to copy'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            Continue to Dashboard
            <ArrowRight size={18} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}