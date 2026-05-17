<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Budget;
use App\Models\ContextMember;
use App\Models\Balance;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

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
     *     @OA\Parameter(name="period", in="query", required=false, @OA\Schema(type="string", enum={"this_month","last_month","last_3_months","this_year","all_time"})),
     *     @OA\Parameter(name="month", in="query", required=false, @OA\Schema(type="integer")),
     *     @OA\Parameter(name="year", in="query", required=false, @OA\Schema(type="integer")),
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

        $period = request('period', 'this_month');
        $month = request('month') ? (int) request('month') : null;
        $year = request('year') ? (int) request('year') : null;

        $dateRange = $this->resolveDateRange($period, $month, $year);

        $totalSpentQuery = Expense::where('context_id', $contextId);
        if ($dateRange['date_from']) {
            $totalSpentQuery->whereDate('expense_date', '>=', $dateRange['date_from']);
        }
        if ($dateRange['date_to']) {
            $totalSpentQuery->whereDate('expense_date', '<=', $dateRange['date_to']);
        }
        $totalSpent = $totalSpentQuery->sum('amount');

        $previousSpent = 0;
        if ($dateRange['prev_date_from'] && $dateRange['prev_date_to']) {
            $previousSpent = Expense::where('context_id', $contextId)
                ->whereDate('expense_date', '>=', $dateRange['prev_date_from'])
                ->whereDate('expense_date', '<=', $dateRange['prev_date_to'])
                ->sum('amount');
        }

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
            'total_spent' => (float) $totalSpent,
            'previous_spent' => (float) $previousSpent,
            'period_label' => $dateRange['label'],
            'previous_period_label' => $dateRange['prev_label'],
            'your_balance' => $balance,
            'member_count' => $memberCount,
            'active_members' => $activeMembers,
        ]);
    }

    private function resolveDateRange(string $period, ?int $month, ?int $year): array
    {
        $now = now();

        return match ($period) {
            'last_month' => (function () use ($now) {
                $date = $now->copy()->subMonthNoOverflow();
                $prev = $date->copy()->subMonthNoOverflow();
                return [
                    'date_from' => $date->copy()->startOfMonth()->toDateString(),
                    'date_to' => $date->copy()->endOfMonth()->toDateString(),
                    'label' => $date->format('F Y'),
                    'prev_date_from' => $prev->startOfMonth()->toDateString(),
                    'prev_date_to' => $prev->endOfMonth()->toDateString(),
                    'prev_label' => $prev->format('F Y'),
                ];
            })(),
            'last_3_months' => [
                'date_from' => $now->copy()->subMonthsNoOverflow(2)->startOfMonth()->toDateString(),
                'date_to' => $now->copy()->endOfMonth()->toDateString(),
                'label' => $now->copy()->subMonthsNoOverflow(2)->format('M Y') . ' – ' . $now->format('M Y'),
                'prev_date_from' => $now->copy()->subMonthsNoOverflow(5)->startOfMonth()->toDateString(),
                'prev_date_to' => $now->copy()->subMonthsNoOverflow(2)->endOfMonth()->toDateString(),
                'prev_label' => $now->copy()->subMonthsNoOverflow(5)->format('M Y') . ' – ' . $now->copy()->subMonthsNoOverflow(3)->format('M Y'),
            ],
            'this_year' => [
                'date_from' => $now->copy()->startOfYear()->toDateString(),
                'date_to' => $now->copy()->toDateString(),
                'label' => $now->copy()->startOfYear()->format('M Y') . ' – ' . $now->format('M Y'),
                'prev_date_from' => $now->copy()->subYearNoOverflow()->startOfYear()->toDateString(),
                'prev_date_to' => $now->copy()->subYearNoOverflow()->toDateString(),
                'prev_label' => $now->copy()->subYearNoOverflow()->startOfYear()->format('M Y') . ' – ' . $now->copy()->subYearNoOverflow()->format('M Y'),
            ],
            'all_time' => [
                'date_from' => null,
                'date_to' => null,
                'label' => 'All Time',
                'prev_date_from' => null,
                'prev_date_to' => null,
                'prev_label' => null,
            ],
            default => (function () use ($now, $month, $year) {
                $m = $month ?? $now->month;
                $y = $year ?? $now->year;
                $date = $now->copy()->setDate($y, $m, 1);
                $prev = $date->copy()->subMonthNoOverflow();
                return [
                    'date_from' => $date->copy()->startOfMonth()->toDateString(),
                    'date_to' => $date->copy()->endOfMonth()->toDateString(),
                    'label' => $date->format('F Y'),
                    'prev_date_from' => $prev->startOfMonth()->toDateString(),
                    'prev_date_to' => $prev->endOfMonth()->toDateString(),
                    'prev_label' => $prev->format('F Y'),
                ];
            })(),
        };
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

    /**
     * GET /api/dashboard/budget-history?context_id=xxx&category_id=yyy
     * Accepts date_from & date_to for a custom range, or month & year for a single month.
     * Daily cumulative actual spending for the given range.
     */
    public function budgetHistory(): JsonResponse
    {
        $contextId = request('context_id');
        $categoryId = request('category_id') ?: null;
        $dateFrom = request('date_from');
        $dateTo = request('date_to');
        $month = (int) (request('month', now()->month));
        $year = (int) (request('year', now()->year));

        abort_if(!$contextId, 400, 'context_id is required.');

        $isMember = ContextMember::where('context_id', $contextId)
            ->where('user_id', Auth::id())
            ->where('status', 'active')
            ->exists();
        abort_if(!$isMember, 403, 'Forbidden.');

        $budget = Budget::where('context_id', $contextId)
            ->where('month', $month)
            ->where('year', $year)
            ->when($categoryId, fn($q) => $q->where('category_id', $categoryId))
            ->when(!$categoryId, fn($q) => $q->whereNull('category_id'))
            ->first();

        // Determine date range
        if ($dateFrom && $dateTo) {
            $startDate = \Carbon\Carbon::parse($dateFrom);
            $endDate = \Carbon\Carbon::parse($dateTo);
        } else {
            $startDate = \Carbon\Carbon::create($year, $month, 1);
            $endDate = \Carbon\Carbon::create($year, $month, 1)->endOfMonth();
        }

        // Daily actual spending in the range
        $dailyActual = Expense::selectRaw('expense_date, SUM(amount) as total')
            ->where('context_id', $contextId)
            ->whereDate('expense_date', '>=', $startDate)
            ->whereDate('expense_date', '<=', $endDate)
            ->whereNull('deleted_at')
            ->when($categoryId, fn($q) => $q->where('category_id', $categoryId))
            ->groupBy('expense_date')
            ->orderBy('expense_date')
            ->get()
            ->keyBy(fn($e) => $e->expense_date->format('Y-m-d'));

        // Monthly history (last 5 months)
        $history = [];
        for ($i = 4; $i >= 0; $i--) {
            $d = now()->subMonthsNoOverflow($i);
            $m = (int) $d->month;
            $y = (int) $d->year;
            $history[] = [
                'month' => $m,
                'year'  => $y,
                'label' => $d->format('M'),
                'spent' => $this->spentInMonth($contextId, $m, $y, $categoryId),
                'is_current' => ($m === $month && $y === $year),
            ];
        }

        // Forecast (only for current month)
        $forecast = null;
        if ($budget) {
            $fc = DB::table('ml_forecasts')
                ->where('context_id', $contextId)
                ->where('month', $month)
                ->where('year', $year)
                ->when($categoryId, fn($q) => $q->where('category_id', $categoryId))
                ->when(!$categoryId, fn($q) => $q->whereNull('category_id'))
                ->first();
            if ($fc) {
                $forecast = [
                    'projected_amount' => (float) $fc->projected_amount,
                    'spent_so_far'     => (float) $fc->spent_so_far,
                    'alert_tier'       => $fc->alert_tier,
                ];
            }
        }

        // Build daily cumulative array for the full range
        $daily = [];
        $cumulative = 0;
        $cursor = $startDate->copy();
        $idx = 0;
        while ($cursor <= $endDate) {
            $key = $cursor->format('Y-m-d');
            $entry = $dailyActual->get($key);
            if ($entry) {
                $cumulative += (float) $entry->total;
            }
            $daily[] = [
                'day'       => $idx + 1,
                'label'     => $cursor->format('d M'),
                'actual'    => $cumulative,
                'projected' => null,
            ];
            $cursor->addDay();
            $idx++;
        }

        return response()->json([
            'budget_amount' => $budget ? (float) $budget->amount : 0,
            'category_name' => $budget?->category?->name,
            'forecast'      => $forecast,
            'history'       => $history,
            'daily'         => $daily,
        ]);
    }

    private function spentInMonth(string $contextId, int $month, int $year, ?string $categoryId): float
    {
        return (float) Expense::where('context_id', $contextId)
            ->whereYear('expense_date', $year)
            ->whereMonth('expense_date', $month)
            ->whereNull('deleted_at')
            ->when($categoryId, fn($q) => $q->where('category_id', $categoryId))
            ->sum('amount');
    }
}