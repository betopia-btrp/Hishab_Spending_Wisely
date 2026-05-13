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

        $expensesTrend = Expense::selectRaw("TO_CHAR(expense_date, 'YYYY-MM') as month, COUNT(*) as count, SUM(amount) as total")
            ->where('expense_date', '>=', now()->subMonths(24))
            ->groupBy(DB::raw("TO_CHAR(expense_date, 'YYYY-MM')"))
            ->orderBy('month')
            ->get();

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

        $userGrowth = User::selectRaw("TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as signups")
            ->where('created_at', '>=', now()->subMonths(24))
            ->groupBy(DB::raw("TO_CHAR(created_at, 'YYYY-MM')"))
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
                'expense_date' => $e->expense_date,
                'category_name' => $e->category?->name,
                'user_name' => $e->creator?->name,
                'context_name' => $e->context?->name,
                'created_at' => $e->created_at,
            ]);

        return response()->json([
            'overview' => [
                'total_users' => $totalUsers,
                'total_expenses' => $totalExpenses,
                'total_contexts' => $totalContexts,
                'total_splits' => $totalSplits,
                'total_budgets' => DB::table('budgets')->count(),
                'premium_users' => $premiumUsers,
                'free_users' => $totalUsers - $premiumUsers,
                'estimated_mrr' => round($premiumUsers * 9.99, 2),
            ],
            'expenses_trend' => $expensesTrend,
            'category_distribution' => $categoryDistribution,
            'daily_spending_30d' => $dailySpending,
            'top_contexts' => $topContexts,
            'top_users' => $topUsers,
            'user_growth' => $userGrowth,
            'recent_activity' => $recentActivity,
        ]);
    }
}
