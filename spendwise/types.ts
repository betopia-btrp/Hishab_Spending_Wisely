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
    total_spent: number;
    avg_expense: number;
  };
  expenses_trend: { month: string; count: number; total: number }[];
  user_growth: { month: string; signups: number }[];
  category_distribution: { name: string; count: number; percentage: number }[];
  daily_spending_30d: { date: string; total: number }[];
  day_of_week: { day_name: string; dow: number; expenses: number; total_spent: number }[];
  split_type_distribution: { split_type: string; count: number }[];
  settled_distribution: { status: string; count: number }[];
  hourly_activity: { hour: number; count: number }[];
  avg_ticket_by_category: { name: string; avg_amount: number; sample_size: number }[];
  most_budgeted_categories: { name: string; budget_count: number; avg_budget_amount: number }[];
  top_expenses: { note: string; amount: number; category_name: string; user_name: string; expense_date: string }[];
  budget_vs_actual: { name: string; budgeted: number; spent: number }[];
  forecast_accuracy: { name: string; avg_projected: number; avg_actual: number; samples: number }[];
  top_contexts: { id: string; name: string; type: string; member_count: number; expense_count: number; total_spent: number }[];
  top_users: { id: string; name: string; expense_count: number; total_spent: number }[];
  top_users_by_activity: { id: string; name: string; expenses_logged: number }[];
  prolific_joiners: { name: string; context_count: number }[];
  context_type_distribution: { type: string; count: number }[];
  group_sizes: { bucket: string; count: number }[];
  context_trend: { month: string; type: string; contexts_created: number }[];
  recent_activity: { id: string; amount: number; note: string; expense_date: string; category_name: string; user_name: string; context_name: string; created_at: string }[];
}

export type PeriodPreset = 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'all_time';

export interface PeriodConfig {
  preset: PeriodPreset;
  month?: number;
  year?: number;
  dateFrom?: string;
  dateTo?: string;
  label: string;
  isSingleMonth: boolean;
}

export interface BacktestResult {
  overall_mape: number | null;
  target_month: number;
  target_year: number;
  cutoff_day: number;
  results: {
    context_id: string;
    category_name: string;
    budget: number;
    projected: number;
    actual: number;
    mape: number | null;
    alert_tier: string | null;
    daily_breakdown: { day: number; projected: number | null; actual: number }[];
  }[];
}

export interface ForecastData {
  context_id: string;
  category_id: string | null;
  month: number;
  year: number;
  projected_amount: number;
  budget_amount: number;
  spent_so_far: number;
  alert_tier: 'overspend' | 'on_track_exceed' | 'early_warning' | null;
}

export interface DashboardSummary {
  total_spent: number;
  previous_spent: number;
  period_label: string;
  previous_period_label: string | null;
  your_balance: number;
  member_count: number;
  total_budget: number;
  budget_utilization: number;
  remaining_budget: number;
  expenses_by_category: { name: string; amount: number; color: string }[];
  recent_expenses: Expense[];
  active_members: ContextMember[];
}
