<?php

namespace App\Notifications;

use App\Models\Context;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class BudgetAlertNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Context $context,
        public ?array $category,
        public string $alertTier,
        public float $spent,
        public float $budget,
        public float $projected,
        public int $month,
        public int $year,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $categoryName = $this->category ? ($this->category['name'] ?? null) : null;

        if ($this->alertTier === 'overspend') {
            $pct = $this->budget > 0 ? round(($this->spent / $this->budget) * 100) : 0;
            $title = "Budget exceeded";
            $message = $categoryName
                ? "You've exceeded your {$categoryName} budget. Spent {$pct}% of your budget."
                : "You've exceeded your monthly budget. Spent {$pct}% of your budget.";
        } elseif ($this->alertTier === 'on_track_exceed') {
            $pct = $this->budget > 0 ? round(($this->projected / $this->budget) * 100 - 100) : 0;
            $title = "On track to exceed budget";
            $message = $categoryName
                ? "You're on track to spend {$pct}% over your {$categoryName} budget this month."
                : "You're on track to spend {$pct}% over your monthly budget.";
        } else {
            $pct = $this->budget > 0 ? round(($this->spent / $this->budget) * 100) : 0;
            $title = "Budget early warning";
            $message = $categoryName
                ? "You've used {$pct}% of your {$categoryName} budget with time left in the month."
                : "You've used {$pct}% of your monthly budget with time left in the month.";
        }

        return [
            'type' => 'budget_alert',
            'alert_tier' => $this->alertTier,
            'context_id' => $this->context->id,
            'context_name' => $this->context->name,
            'category_name' => $categoryName,
            'month' => $this->month,
            'year' => $this->year,
            'spent' => $this->spent,
            'budget' => $this->budget,
            'projected' => $this->projected,
            'percentage' => $pct,
            'title' => $title,
            'message' => $message,
        ];
    }
}
