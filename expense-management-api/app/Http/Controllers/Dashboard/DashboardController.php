<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\ContextMember;
use App\Models\Balance;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * @OA\Tag(name="Dashboard")
 */

class DashboardController extends Controller
{
    /**
     * GET /api/dashboard?context_id=xxx
     * Overview: total spent, your balance, member count
     */

    /**
     * @OA\Get(
     *     path="/api/dashboard",
     *     tags={"Dashboard"},
     *     security={{"bearerAuth":{}}},
     *     summary="Dashboard overview",
     *     @OA\Parameter(name="context_id", in="query", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(response=200, description="Dashboard data")
     * )
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

        $activeMembers = ContextMember::where('context_id', $contextId)
            ->where('status', 'active')
            ->with('user:id,name,email,avatar_url')
            ->get()
            ->map(fn($m) => [
                'id' => $m->id,
                'user_id' => $m->user_id,
                'role' => $m->role,
                'user' => $m->user,
            ]);

        return response()->json([
            'total_spent' => $totalSpent,
            'your_balance' => $balance,
            'member_count' => $memberCount,
            'active_members' => $activeMembers,
        ]);
    }

    /**
     * GET /api/dashboard/chart?context_id=xxx
     * Daily totals for the last 30 days
     */

    /**
     * @OA\Get(
     *     path="/api/dashboard/chart",
     *     tags={"Dashboard"},
     *     security={{"bearerAuth":{}}},
     *     summary="Daily expense chart (last 30 days)",
     *     @OA\Parameter(name="context_id", in="query", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(response=200, description="Chart data")
     * )
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

    /**
     * @OA\Get(
     *     path="/api/dashboard/activity",
     *     tags={"Dashboard"},
     *     security={{"bearerAuth":{}}},
     *     summary="Recent activity",
     *     @OA\Parameter(name="context_id", in="query", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(response=200, description="Recent expenses")
     * )
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