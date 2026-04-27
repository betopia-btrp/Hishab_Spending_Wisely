<?php

namespace App\Jobs;

use App\Models\ContextMember;
use App\Models\Reminder;
use App\Models\User;
use App\Notifications\ReminderNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendReminderNotifications implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        // Find all due, non-completed reminders
        $due = Reminder::with(['context', 'targetUser'])
            ->where('is_completed', false)
            ->where(function ($q) {
                // One-shot: remind_at has passed
                $q->where(function ($q2) {
                    $q2->where('recurrence_type', 'none')
                       ->where('remind_at', '<=', now());
                })
                // Recurring: next_occurrence_at has passed (or first run)
                ->orWhere(function ($q2) {
                    $q2->where('recurrence_type', '!=', 'none')
                       ->where(function ($q3) {
                           $q3->whereNull('next_occurrence_at')
                              ->orWhere('next_occurrence_at', '<=', now());
                       });
                });
            })
            ->whereNull('deleted_at')
            ->get();

        foreach ($due as $reminder) {
            try {
                $recipients = $this->resolveRecipients($reminder);

                foreach ($recipients as $user) {
                    $user->notify(new ReminderNotification($reminder));
                }

                if ($reminder->isRecurring()) {
                    // FR-RE-05: advance next_occurrence_at, keep is_completed false
                    $reminder->advanceNextOccurrence();
                } else {
                    // One-shot: mark completed
                    $reminder->update(['is_completed' => true]);
                }
            } catch (\Throwable $e) {
                Log::error("Reminder dispatch failed for {$reminder->id}: {$e->getMessage()}");
            }
        }
    }

    /**
     * FR-RE-04: If user_id is set → only that user.
     *           If null → all active context members.
     */
    private function resolveRecipients(Reminder $reminder): \Illuminate\Support\Collection
    {
        if ($reminder->user_id) {
            return User::where('id', $reminder->user_id)->get();
        }

        return User::whereIn('id',
            ContextMember::where('context_id', $reminder->context_id)
                ->where('status', 'active')
                ->pluck('user_id')
        )->get();
    }
}