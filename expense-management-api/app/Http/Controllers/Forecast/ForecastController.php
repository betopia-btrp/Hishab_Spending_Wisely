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
use Illuminate\Support\Facades\Log;

class ForecastController extends Controller
{
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

        // Ensure user is a member of this context
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
     * Trigger forecast for the authenticated user.
     */
    public function run(Request $request): JsonResponse
    {
        $user = auth()->user();

        // Path to Python script
        $scriptPath = base_path('../ml/forecast/run.py');
        if (!file_exists($scriptPath)) {
            return response()->json(['message' => 'Forecast script not found.'], 500);
        }

        // Find all contexts the user belongs to
        $contexts = Context::whereHas('members', function ($q) use ($user) {
            $q->where('user_id', $user->id)->where('status', 'active');
        })->get();

        if ($contexts->isEmpty()) {
            return response()->json(['forecasts' => [], 'notifications' => []]);
        }

        // Run Python script for this user
        $pythonBin = env('PYTHON_BIN', base_path('../venv/bin/python3'));
        $dbHost = env('ML_FORECAST_DB_HOST', '127.0.0.1');
        $dbPort = env('ML_FORECAST_DB_PORT', '5435');
        $stderrLog = storage_path('logs/forecast-run.log');
        $cmd = sprintf(
            'cd %s && %s %s --user-id %s --db-host %s --db-port %s 2>%s',
            escapeshellarg(dirname($scriptPath)),
            escapeshellcmd($pythonBin),
            escapeshellarg($scriptPath),
            escapeshellarg($user->id),
            escapeshellarg($dbHost),
            escapeshellarg($dbPort),
            escapeshellarg($stderrLog)
        );
        $output = shell_exec($cmd);

        if ($output === null) {
            return response()->json(['message' => 'Forecast execution failed.'], 500);
        }

        // Fetch the updated forecasts
        $forecasts = DB::table('ml_forecasts')
            ->whereIn('context_id', $contexts->pluck('id'))
            ->where('month', now()->month)
            ->where('year', now()->year)
            ->get();

        // Create notifications for new alerts (dedup by context+category+tier+date)
        $today = now()->format('Y-m-d');
        $newNotifications = [];

        // Fetch notifications created today for budget alerts
        $existingNotifs = \App\Models\User::join('notifications', 'notifications.notifiable_id', '=', 'users.id')
            ->where('notifications.type', \App\Notifications\BudgetAlertNotification::class)
            ->whereIn('notifications.notifiable_id', $contexts->pluck('owner_id')->filter())
            ->whereDate('notifications.created_at', now()->toDateString())
            ->pluck('notifications.data')
            ->map(fn($d) => json_decode($d, true))
            ->filter()
            ->values();

        $alertKeyExists = function ($contextId, $categoryId, $tier) use ($existingNotifs) {
            $catKey = $categoryId ?? '__null__';
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

            // Resolve context + category
            $context = Context::find($f->context_id);
            $category = $f->category_id ? Category::find($f->category_id) : null;

            if (!$context) {
                continue;
            }

            // Skip if notification already sent today for this alert
            if ($alertKeyExists($f->context_id, $f->category_id, $f->alert_tier)) {
                continue;
            }

            // Notify all active members of this context
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
     * Run forecast as if today were cutoff_day, compare with actual full-month spend.
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

        $scriptPath = base_path('../ml/forecast/run.py');
        if (!file_exists($scriptPath)) {
            return response()->json(['message' => 'Forecast script not found.'], 500);
        }

        $pythonBin = env('PYTHON_BIN', base_path('../venv/bin/python3'));
        $dbHost = env('ML_FORECAST_DB_HOST', '127.0.0.1');
        $dbPort = env('ML_FORECAST_DB_PORT', '5435');
        $stderrLog = storage_path('logs/forecast-backtest.log');
        $cmd = sprintf(
            'cd %s && %s %s --user-id %s --target-month %d --target-year %d --cutoff-day %d --db-host %s --db-port %s 2>%s',
            escapeshellarg(dirname($scriptPath)),
            escapeshellcmd($pythonBin),
            escapeshellarg($scriptPath),
            escapeshellarg($user->id),
            $month,
            $year,
            $cutoffDay,
            escapeshellarg($dbHost),
            escapeshellarg($dbPort),
            escapeshellarg($stderrLog)
        );
        $output = shell_exec($cmd);

        if ($output === null) {
            return response()->json(['message' => 'Backtest execution failed.'], 500);
        }

        $decoded = json_decode($output, true);
        if (!$decoded || !isset($decoded['backtest'])) {
            Log::error("Backtest parse error for user {$user->id}. stderr in {$stderrLog}");
            return response()->json(['message' => 'Invalid backtest output.'], 500);
        }

        $decoded = json_decode($output, true);
        if (!$decoded || !isset($decoded['backtest'])) {
            Log::error("Backtest parse error for user {$user->id}: " . substr($output, 0, 500));
            return response()->json(['message' => 'Invalid backtest output.'], 500);
        }

        return response()->json($decoded);
    }
}
