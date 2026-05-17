<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Context;
use App\Models\Expense;
use App\Models\ExpenseSplit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AdminController extends Controller
{
    public function dashboard(): JsonResponse
    {
        $totalUsers = User::count();
        $totalExpenses = Expense::count();
        $totalContexts = Context::count();
        $totalSplits = ExpenseSplit::count();
        $premiumUsers = User::where('is_premium', true)->count();

        // ── PLATFORM PULSE ──
        $expensesTrend = Expense::selectRaw("TO_CHAR(expense_date, 'YYYY-MM') as month, COUNT(*) as count, SUM(amount) as total")
            ->where('expense_date', '>=', now()->subMonths(24))
            ->groupBy(DB::raw("TO_CHAR(expense_date, 'YYYY-MM')"))
            ->orderBy('month')
            ->get();

        $userGrowth = User::selectRaw("TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as signups")
            ->where('created_at', '>=', now()->subMonths(24))
            ->groupBy(DB::raw("TO_CHAR(created_at, 'YYYY-MM')"))
            ->orderBy('month')
            ->get();

        // ── SPENDING DEEP DIVE ──
        $categoryDistribution = DB::table('expenses')
            ->join('categories', 'expenses.category_id', '=', 'categories.id')
            ->selectRaw('categories.name, COUNT(*) as count, ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM expenses WHERE deleted_at IS NULL) * 100, 1) as percentage')
            ->whereNull('expenses.deleted_at')
            ->groupBy('categories.name')
            ->orderByDesc('count')
            ->get();

        $dailySpending = Expense::selectRaw('expense_date, SUM(amount) as total')
            ->where('expense_date', '>=', now()->subDays(30))
            ->groupBy('expense_date')
            ->orderBy('expense_date')
            ->get();

        $dayOfWeek = Expense::selectRaw("TO_CHAR(expense_date, 'Day') as day_name, EXTRACT(ISODOW FROM expense_date) as dow, COUNT(*) as expenses, SUM(amount) as total_spent")
            ->whereNull('deleted_at')
            ->groupBy(DB::raw("TO_CHAR(expense_date, 'Day'), EXTRACT(ISODOW FROM expense_date)"))
            ->orderBy('dow')
            ->get();

        $splitTypeDist = Expense::selectRaw("split_type, COUNT(*) as count")
            ->whereNull('deleted_at')
            ->where('split_type', '!=', 'none')
            ->groupBy('split_type')
            ->get();

        $settledDist = Expense::selectRaw("CASE WHEN is_settled THEN 'Settled' ELSE 'Unsettled' END as status, COUNT(*) as count")
            ->whereNull('deleted_at')
            ->groupBy('is_settled')
            ->get();

        $hourlyActivity = Expense::selectRaw("EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count")
            ->whereNull('deleted_at')
            ->groupBy(DB::raw("EXTRACT(HOUR FROM created_at)"))
            ->orderBy('hour')
            ->get();

        $avgTicketByCat = DB::table('expenses')
            ->join('categories', 'expenses.category_id', '=', 'categories.id')
            ->selectRaw("categories.name, ROUND(AVG(expenses.amount)::numeric, 2) as avg_amount, COUNT(*) as sample_size")
            ->whereNull('expenses.deleted_at')
            ->groupBy('categories.name')
            ->orderByDesc('avg_amount')
            ->get();

        $mostBudgetedCats = DB::table('budgets')
            ->join('categories', 'budgets.category_id', '=', 'categories.id')
            ->selectRaw("categories.name, COUNT(*) as budget_count, ROUND(AVG(budgets.amount)::numeric, 2) as avg_budget_amount")
            ->groupBy('categories.name')
            ->orderByDesc('budget_count')
            ->get();

        $topExpenses = Expense::with(['category', 'creator', 'context'])
            ->whereNotNull('note')
            ->whereNull('deleted_at')
            ->orderByDesc('amount')
            ->limit(10)
            ->get()
            ->map(fn($e) => [
                'note' => $e->note,
                'amount' => $e->amount,
                'category_name' => $e->category?->name,
                'user_name' => $e->creator?->name,
                'expense_date' => $e->expense_date,
            ]);

        $budgetVsActual = DB::table('budgets')
            ->join('categories', 'budgets.category_id', '=', 'categories.id')
            ->leftJoin('expenses', function ($j) {
                $j->on('expenses.context_id', '=', 'budgets.context_id')
                  ->on('expenses.category_id', '=', 'budgets.category_id')
                  ->whereMonth('expenses.expense_date', now()->month)
                  ->whereYear('expenses.expense_date', now()->year)
                  ->whereNull('expenses.deleted_at');
            })
            ->selectRaw("categories.name, ROUND(SUM(budgets.amount)::numeric, 2) as budgeted, ROUND(COALESCE(SUM(expenses.amount), 0)::numeric, 2) as spent")
            ->where('budgets.month', now()->month)
            ->where('budgets.year', now()->year)
            ->whereNotNull('budgets.category_id')
            ->groupBy('categories.name')
            ->orderByDesc('spent')
            ->get();

        $forecastAccuracy = collect(now()->subMonth()->month === 12
            ? [['month' => 12, 'year' => now()->year - 1]]
            : [['month' => now()->subMonth()->month, 'year' => now()->year]]
        )->flatMap(function ($p) {
            return DB::table('ml_forecasts')
                ->join('categories', 'ml_forecasts.category_id', '=', 'categories.id')
                ->join('expenses', function ($j) use ($p) {
                    $j->on('expenses.context_id', '=', 'ml_forecasts.context_id')
                      ->on('expenses.category_id', '=', 'ml_forecasts.category_id')
                      ->whereMonth('expenses.expense_date', $p['month'])
                      ->whereYear('expenses.expense_date', $p['year'])
                      ->whereNull('expenses.deleted_at');
                })
                ->selectRaw("categories.name, ROUND(AVG(ml_forecasts.projected_amount)::numeric, 2) as avg_projected, ROUND(AVG(expenses.amount)::numeric, 2) as avg_actual, COUNT(*) as samples")
                ->where('ml_forecasts.month', $p['month'])
                ->where('ml_forecasts.year', $p['year'])
                ->groupBy('categories.name')
                ->orderByDesc('samples')
                ->get();
        });

        // ── USERS & CONTEXTS ──
        $topContexts = Context::selectRaw('contexts.id, contexts.name, contexts.type, COUNT(DISTINCT cm.id) as member_count, COUNT(DISTINCT e.id) as expense_count, COALESCE(SUM(e.amount), 0) as total_spent')
            ->leftJoin('context_members as cm', 'contexts.id', '=', 'cm.context_id')
            ->leftJoin('expenses as e', 'contexts.id', '=', 'e.context_id')
            ->groupBy('contexts.id', 'contexts.name', 'contexts.type')
            ->orderByDesc('total_spent')
            ->limit(10)
            ->get();

        $topUsers = User::selectRaw('users.id, users.name, COUNT(e.id) as expense_count, COALESCE(SUM(e.amount), 0) as total_spent')
            ->leftJoin('expenses as e', 'users.id', '=', 'e.created_by')
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('total_spent')
            ->limit(10)
            ->get();

        $topUsersByActivity = User::selectRaw('users.id, users.name, COUNT(e.id) as expenses_logged')
            ->join('expenses as e', 'users.id', '=', 'e.created_by')
            ->whereNull('e.deleted_at')
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('expenses_logged')
            ->limit(10)
            ->get();

        $prolificJoiners = User::selectRaw('users.name, COUNT(cm.id) as context_count')
            ->join('context_members as cm', 'users.id', '=', 'cm.user_id')
            ->where('cm.status', 'active')
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('context_count')
            ->limit(10)
            ->get();

        $contextTypeDist = Context::selectRaw("type, COUNT(*) as count")
            ->whereNull('deleted_at')
            ->groupBy('type')
            ->get();

        $groupSizes = DB::select("
            SELECT
                CASE
                    WHEN member_count <= 2 THEN '2 members'
                    WHEN member_count <= 4 THEN '3-4 members'
                    WHEN member_count <= 6 THEN '5-6 members'
                    ELSE '7+ members'
                END as bucket,
                COUNT(*) as count
            FROM (
                SELECT cm.context_id, COUNT(cm.id) as member_count
                FROM context_members cm
                JOIN contexts c ON cm.context_id = c.id
                WHERE cm.status = 'active'
                  AND c.type = 'group'
                  AND c.deleted_at IS NULL
                GROUP BY cm.context_id
            ) sub
            GROUP BY bucket
            ORDER BY bucket
        ");

        $contextTrend = Context::selectRaw("TO_CHAR(created_at, 'YYYY-MM') as month, type, COUNT(*) as contexts_created")
            ->whereNull('deleted_at')
            ->groupBy(DB::raw("TO_CHAR(created_at, 'YYYY-MM'), type"))
            ->orderBy('month')
            ->get();

        $recentActivity = Expense::with(['category', 'creator', 'context'])
            ->latest()
            ->limit(20)
            ->get()
            ->map(fn($e) => [
                'id' => $e->id,
                'amount' => $e->amount,
                'note' => $e->note,
                'category_name' => $e->category?->name,
                'user_name' => $e->creator?->name,
                'context_name' => $e->context?->name,
                'created_at' => $e->created_at,
            ]);

        return response()->json([
            // Overview
            'overview' => [
                'total_users' => $totalUsers,
                'total_expenses' => $totalExpenses,
                'total_contexts' => $totalContexts,
                'total_splits' => $totalSplits,
                'total_budgets' => DB::table('budgets')->count(),
                'premium_users' => $premiumUsers,
                'free_users' => $totalUsers - $premiumUsers,
                'estimated_mrr' => round($premiumUsers * 9.99, 2),
                'total_spent' => round(Expense::whereNull('deleted_at')->sum('amount'), 2),
                'avg_expense' => round(Expense::whereNull('deleted_at')->avg('amount') ?? 0, 2),
            ],
            'expenses_trend' => $expensesTrend,
            'user_growth' => $userGrowth,

            // Spending
            'category_distribution' => $categoryDistribution,
            'daily_spending_30d' => $dailySpending,
            'day_of_week' => $dayOfWeek,
            'split_type_distribution' => $splitTypeDist,
            'settled_distribution' => $settledDist,
            'hourly_activity' => $hourlyActivity,
            'avg_ticket_by_category' => $avgTicketByCat,
            'most_budgeted_categories' => $mostBudgetedCats,
            'top_expenses' => $topExpenses,
            'budget_vs_actual' => $budgetVsActual,
            'forecast_accuracy' => $forecastAccuracy,

            // Users & Contexts
            'top_contexts' => $topContexts,
            'top_users' => $topUsers,
            'top_users_by_activity' => $topUsersByActivity,
            'prolific_joiners' => $prolificJoiners,
            'context_type_distribution' => $contextTypeDist,
            'group_sizes' => $groupSizes,
            'context_trend' => $contextTrend,
            'recent_activity' => $recentActivity,
        ]);
    }
}
