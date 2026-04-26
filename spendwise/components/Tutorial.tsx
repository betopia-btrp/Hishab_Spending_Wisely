/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, ArrowRight, CheckCircle, Smartphone, Users, Layout } from 'lucide-react';

const steps = [
  {
    title: "Contexts: Personal vs Group",
    description: "Switch between your private ledger and shared group expenses using the workspace selector in the sidebar.",
    icon: Users,
    color: "bg-emerald-50 text-[#636B2F]"
  },
  {
    title: "Navigation Tabs",
    description: "Access your expenses, balances, and budgets from the main navigation. Watch for the active state highlighting.",
    icon: Layout,
    color: "bg-emerald-50 text-[#636B2F]"
  },
  {
    title: "Real-time Syncing",
    description: "Your data is automatically encrypted and synced across all devices. Look for the sync indicators in the navbar.",
    icon: Smartphone,
    color: "bg-emerald-50 text-[#636B2F]"
  }
];

export default function Tutorial({ onClose }: { onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);

  const next = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      onClose();
    }
  };

  const StepIcon = steps[currentStep].icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100"
      >
        <div className="bg-slate-50 p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-[#636B2F]">
                <GraduationCap size={24} />
             </div>
             <div>
                <h3 className="font-extrabold text-slate-900 leading-none">Navigation Guide</h3>
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mt-1">Step {currentStep + 1} of {steps.length}</p>
             </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-sm">Skip</button>
        </div>

        <div className="p-10 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className={`w-20 h-20 ${steps[currentStep].color} rounded-[2rem] mx-auto flex items-center justify-center shadow-lg`}>
                <StepIcon size={40} />
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">{steps[currentStep].title}</h4>
                <p className="text-slate-500 font-medium leading-relaxed">{steps[currentStep].description}</p>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-10 flex gap-2 justify-center">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all duration-500 ${i === currentStep ? 'w-8 bg-[#636B2F]' : 'w-2 bg-slate-200'}`} 
              />
            ))}
          </div>

          <button 
            onClick={next}
            className="w-full mt-10 bg-[#636B2F] text-white py-4 rounded-2xl font-black shadow-xl shadow-emerald-900/10 hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 group"
          >
            {currentStep === steps.length - 1 ? (
              <>
                Let's Start
                <CheckCircle size={20} />
              </>
            ) : (
              <>
                Next Guide
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
