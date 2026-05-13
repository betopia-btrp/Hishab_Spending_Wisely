/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ContextType {
  PERSONAL = 'personal',
  GROUP = 'group',
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  is_premium: boolean;
  is_admin?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Context {
  id: string;
  name: string;
  description?: string;
  type: ContextType;
  invite_code?: string;
  members_count?: number;
  owner_id?: string;
  created_at?: string;
}

export interface ContextMember {
  id: string;
  context_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending';
  user?: User;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  user_id?: string;
  context_id?: string;
  is_system?: boolean;
}

export interface Expense {
  id: string;
  amount: number;
  note?: string;
  expense_date: string;
  category_id: string;
  context_id: string;
  user_id: string;
  split_type: 'none' | 'equal' | 'custom' | 'percentage';
  is_settled: boolean;
  created_at?: string;
  updated_at?: string;
  category?: Category;
  user?: User;
  splits?: ExpenseSplit[];
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  share_amount: number;
  percentage?: number;
  user?: User;
}

export interface Balance {
  from_user_id: string;
  to_user_id: string;
  amount: number;
  context_id: string;
  from_user?: User;
  to_user?: User;
}

export interface Budget {
  id: string;
  amount: number;
  month: number;
  year: number;
  category_id?: string;
  context_id: string;
  category?: Category;
  spent_amount?: number;
  remaining?: number;
  percentage_used?: number;
}

export interface Settlement {
  id: string;
  context_id: string;
  amount: number;
  settled_by: string;
  created_at: string;
}

export interface AdminDashboardData {
  overview: {
    total_users: number;
    total_expenses: number;
    total_contexts: number;
    total_splits: number;
    total_budgets: number;
    premium_users: number;
    free_users: number;
    estimated_mrr: number;
  };
  expenses_trend: { month: string; count: number; total: number }[];
  category_distribution: { name: string; count: number; percentage: number }[];
  daily_spending_30d: { date: string; total: number }[];
  top_contexts: { id: string; name: string; type: string; member_count: number; expense_count: number; total_spent: number }[];
  top_users: { id: string; name: string; expense_count: number; total_spent: number }[];
  user_growth: { month: string; signups: number }[];
  recent_activity: { id: string; amount: number; note: string; expense_date: string; category_name: string; user_name: string; context_name: string; created_at: string }[];
}

export interface DashboardSummary {
  total_spent_month: number;
  your_balance: number;
  member_count: number;
  total_budget: number;
  budget_utilization: number;
  expenses_by_category: { name: string; amount: number; color: string }[];
  recent_expenses: Expense[];
  monthly_comparison: { current: number; previous: number };
  active_members: ContextMember[];
}
