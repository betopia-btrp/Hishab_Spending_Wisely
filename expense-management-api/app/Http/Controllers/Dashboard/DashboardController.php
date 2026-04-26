<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\ContextMember;
use App\Models\Balance;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    /**
     * GET /api/dashboard?context_id=xxx
     * Overview: total spent, your balance, member count
     */
    public function index(): JsonResponse
    {
        $contextId = request('context_id');

        abort_if(!$contextId, 400, 'context_id is required.');

        $isMember = ContextMember::where('context_id', $contextId)
            ->where('user_id', Auth::id())
            ->where('status', 'active')
            ->exists();

        abort_if(!$isMember, 403, 'You do not have access to this context.');

        $totalSpent = Expense::where('context_id', $contextId)
            ->sum('amount');

        $memberCount = ContextMember::where('context_id', $contextId)
            ->where('status', 'active')
            ->count();

        $balance = Balance::where('context_id', $contextId)
            ->where(function ($q) {
                $q->where('from_user_id', Auth::id())
                  ->orWhere('to_user_id', Auth::id());
            })
            ->get()
            ->reduce(function ($carry, $b) {
                $amount = (float) $b->amount;
                if ($b->from_user_id === Auth::id()) {
                    return $carry + $amount;
                }
                return $carry - $amount;
            }, 0);

        return response()->json([
            'total_spent' => $totalSpent,
            'your_balance' => $balance,
            'member_count' => $memberCount,
        ]);
    }

    /**
     * GET /api/dashboard/chart?context_id=xxx
     * Daily totals for the last 30 days
     */
    public function chart(): JsonResponse
    {
        $contextId = request('context_id');

        abort_if(!$contextId, 400, 'context_id is required.');

        $isMember = ContextMember::where('context_id', $contextId)
            ->where('user_id', Auth::id())
            ->where('status', 'active')
            ->exists();

        abort_if(!$isMember, 403, 'You do not have access to this context.');

        $dailyTotals = Expense::where('context_id', $contextId)
            ->whereDate('expense_date', '>=', now()->subDays(30))
            ->groupBy('expense_date')
            ->orderBy('expense_date')
            ->selectRaw('expense_date, SUM(amount) as total')
            ->get()
            ->map(fn($e) => [
                'date' => $e->expense_date,
                'total' => (float) $e->total,
            ]);

        return response()->json($dailyTotals);
    }

    /**
     * GET /api/dashboard/activity?context_id=xxx
     * Recent expenses and settlements
     */
    public function activity(): JsonResponse
    {
        $contextId = request('context_id');

        abort_if(!$contextId, 400, 'context_id is required.');

        $isMember = ContextMember::where('context_id', $contextId)
            ->where('user_id', Auth::id())
            ->where('status', 'active')
            ->exists();

        abort_if(!$isMember, 403, 'You do not have access to this context.');

        $expenses = Expense::with(['category:id,name,icon', 'creator:name'])
            ->where('context_id', $contextId)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get()
            ->map(fn($e) => [
                'type' => 'expense',
                'id' => $e->id,
                'amount' => (float) $e->amount,
                'date' => $e->expense_date,
                'note' => $e->note,
                'category' => $e->category,
                'creator' => $e->creator,
                'created_at' => $e->created_at,
            ]);

        return response()->json($expenses);
    }
}