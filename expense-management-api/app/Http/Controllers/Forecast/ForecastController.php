<?php

namespace App\Http\Controllers\Forecast;

use App\Http\Controllers\Controller;
use App\Models\Budget;
use App\Models\Context;
use App\Models\ContextMember;
use App\Models\Category;
use App\Notifications\BudgetAlertNotification;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ForecastController extends Controller
{
    private function mlServiceUrl(): string
    {
        return env('ML_SERVICE_URL', 'http://127.0.0.1:5100');
    }

    /**
     * GET /api/forecasts?context_id=X&month=M&year=Y
     * Return cached forecasts for a context.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'context_id' => ['required', 'uuid', 'exists:contexts,id'],
            'month'      => ['nullable', 'integer', 'between:1,12'],
            'year'       => ['nullable', 'integer', 'min:2000', 'max:2100'],
        ]);

        $user = auth()->user();
        $contextId = $request->input('context_id');
        $month = $request->input('month', now()->month);
        $year  = $request->input('year', now()->year);

        $member = ContextMember::where('context_id', $contextId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (!$member) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $forecasts = DB::table('ml_forecasts')
            ->where('context_id', $contextId)
            ->where('month', $month)
            ->where('year', $year)
            ->get();

        return response()->json([
            'forecasts' => $forecasts,
        ]);
    }

    /**
     * POST /api/forecasts/run
     * Trigger forecast for the authenticated user via ML microservice.
     * Skips if fresh data (less than 4 hours old) already exists,
     * unless `force=true` is passed in the request body.
     */
    public function run(Request $request): JsonResponse
    {
        $user = auth()->user();
        $force = $request->input('force', false);

        $contexts = Context::whereHas('members', function ($q) use ($user) {
            $q->where('user_id', $user->id)->where('status', 'active');
        })->get();

        if ($contexts->isEmpty()) {
            return response()->json(['forecasts' => [], 'notifications' => []]);
        }

        $month = now()->month;
        $year = now()->year;
        $ctxIds = $contexts->pluck('id');

        // Check for fresh cached forecasts (less than 4 hours old) unless forced
        $shouldRun = $force;
        if (!$shouldRun) {
            $freshCutoff = now()->subHours(4);
            $shouldRun = !DB::table('ml_forecasts')
                ->whereIn('context_id', $ctxIds)
                ->where('month', $month)
                ->where('year', $year)
                ->where('created_at', '>=', $freshCutoff)
                ->exists();
        }

        if ($shouldRun) {
            try {
                $response = Http::timeout(120)->post($this->mlServiceUrl() . '/forecast', [
                    'user_id' => $user->id,
                    'db_host' => env('ML_FORECAST_DB_HOST', '127.0.0.1'),
                    'db_port' => (int) env('ML_FORECAST_DB_PORT', '5435'),
                ]);

                if ($response->failed()) {
                    Log::error('ML service error: ' . $response->body());
                    return response()->json(['message' => 'Forecast execution failed.'], 500);
                }
            } catch (\Exception $e) {
                Log::error('ML service unreachable: ' . $e->getMessage());
                return response()->json(['message' => 'ML service unreachable. Start it with: powershell -File ml/service/run.ps1'], 500);
            }
        }

        // Fetch forecasts from DB
        $forecasts = DB::table('ml_forecasts')
            ->whereIn('context_id', $ctxIds)
            ->where('month', $month)
            ->where('year', $year)
            ->get();

        // Create notifications for new alerts
        $today = now()->format('Y-m-d');
        $newNotifications = [];

        $existingNotifs = \App\Models\User::join('notifications', 'notifications.notifiable_id', '=', 'users.id')
            ->where('notifications.type', \App\Notifications\BudgetAlertNotification::class)
            ->whereIn('notifications.notifiable_id', $contexts->pluck('owner_id')->filter())
            ->whereDate('notifications.created_at', now()->toDateString())
            ->pluck('notifications.data')
            ->map(fn($d) => json_decode($d, true))
            ->filter()
            ->values();

        $alertKeyExists = function ($contextId, $categoryId, $tier) use ($existingNotifs) {
            return $existingNotifs->contains(fn($n) =>
                ($n['context_id'] ?? null) === $contextId
                && ($n['category_name'] ?? '__null__') === ($categoryId ? '' : '__null__')
                && ($n['alert_tier'] ?? null) === $tier
            );
        };

        foreach ($forecasts as $f) {
            if (!$f->alert_tier) {
                continue;
            }

            $context = Context::find($f->context_id);
            $category = $f->category_id ? Category::find($f->category_id) : null;

            if (!$context) {
                continue;
            }

            if ($alertKeyExists($f->context_id, $f->category_id, $f->alert_tier)) {
                continue;
            }

            $members = ContextMember::where('context_id', $f->context_id)
                ->where('status', 'active')
                ->get();

            foreach ($members as $member) {
                $memberUser = $member->user;
                if (!$memberUser) {
                    continue;
                }

                $memberUser->notify(new BudgetAlertNotification(
                    context: $context,
                    category: $category ? ['id' => $category->id, 'name' => $category->name] : null,
                    alertTier: $f->alert_tier,
                    spent: (float) $f->spent_so_far,
                    budget: (float) $f->budget_amount,
                    projected: (float) $f->projected_amount,
                    month: $f->month,
                    year: $f->year,
                ));

                $newNotifications[] = [
                    'user_id' => $memberUser->id,
                    'alert_tier' => $f->alert_tier,
                ];
            }
        }

        return response()->json([
            'forecasts' => $forecasts,
            'new_notifications' => count($newNotifications),
        ]);
    }

    /**
     * POST /api/forecasts/backtest
     * Run backtest via ML microservice.
     */
    public function backtest(Request $request): JsonResponse
    {
        $request->validate([
            'context_id' => ['required', 'uuid', 'exists:contexts,id'],
            'month'      => ['required', 'integer', 'between:1,12'],
            'year'       => ['required', 'integer', 'min:2000', 'max:2100'],
            'cutoff_day' => ['nullable', 'integer', 'min:1', 'max:28'],
        ]);

        $user = auth()->user();
        $contextId = $request->input('context_id');
        $month = (int) $request->input('month');
        $year  = (int) $request->input('year');
        $cutoffDay = (int) ($request->input('cutoff_day', 13));

        $member = ContextMember::where('context_id', $contextId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (!$member) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        try {
            $response = Http::timeout(120)->post($this->mlServiceUrl() . '/backtest', [
                'user_id' => $user->id,
                'month' => $month,
                'year' => $year,
                'cutoff_day' => $cutoffDay,
                'db_host' => env('ML_FORECAST_DB_HOST', '127.0.0.1'),
                'db_port' => (int) env('ML_FORECAST_DB_PORT', '5435'),
            ]);

            if ($response->failed()) {
                Log::error('ML service error: ' . $response->body());
                return response()->json(['message' => 'Backtest execution failed.'], 500);
            }

            return response()->json($response->json());
        } catch (\Exception $e) {
            Log::error('ML service unreachable: ' . $e->getMessage());
            return response()->json(['message' => 'ML service unreachable. Start it with: powershell -File ml/service/run.ps1'], 500);
        }
    }
}
