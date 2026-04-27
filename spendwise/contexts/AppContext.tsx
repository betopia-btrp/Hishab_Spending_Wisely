/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Context, ContextType } from '../types';
import axios from '../lib/axios';
import { useAuth } from './AuthContext';

interface AppContextType {
  currentContext: Context | null;
  availableContexts: Context[];
  switchContext: (contextId: string) => void;
  refreshContexts: () => Promise<void>;
  loading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [currentContext, setCurrentContext] = useState<Context | null>(null);
  const [availableContexts, setAvailableContexts] = useState<Context[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchContexts = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await axios.get('/contexts');
      const data = res.data;
      
      // Backend returns { personal: Context, groups: Context[] } or array
      let contexts: Context[] = [];
      
      if (Array.isArray(data)) {
        contexts = data;
      } else if (data && typeof data === 'object') {
        // Handle { personal, groups } format
        if (data.personal) {
          contexts.push(data.personal);
        }
        if (data.groups && Array.isArray(data.groups)) {
          contexts = contexts.concat(data.groups);
        }
      }
      
      setAvailableContexts(contexts);
      
      const savedContextId = localStorage.getItem('selectedContextId');
      const savedContext = contexts.find(c => c.id === savedContextId);
      
      if (savedContext) {
        setCurrentContext(savedContext);
      } else {
        const personal = contexts.find(c => c.type === ContextType.PERSONAL);
        if (personal) {
          setCurrentContext(personal);
          localStorage.setItem('selectedContextId', personal.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch contexts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchContexts();
    }
  }, [isAuthenticated]);

  const switchContext = async (contextId: string) => {
    // First refresh contexts to ensure we have the latest
    await fetchContexts();
    
    // Then find the context from the updated list
    const context = availableContexts.find(c => c.id === contextId);
    
    if (context) {
      setCurrentContext(context);
      localStorage.setItem('selectedContextId', contextId);
    } else {
      // If not found after refresh, get it from API directly
      try {
        const res = await axios.get(`/contexts/${contextId}`);
        if (res.data) {
          setCurrentContext(res.data);
          localStorage.setItem('selectedContextId', contextId);
        }
      } catch (err) {
        console.error('Failed to switch context', err);
      }
    }
  };

  return (
    <AppContext.Provider 
      value={{ 
        currentContext, 
        availableContexts, 
        switchContext, 
        refreshContexts: fetchContexts, 
        loading 
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
}
