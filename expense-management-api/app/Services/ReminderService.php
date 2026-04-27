<?php

namespace App\Services;

use App\Models\ContextMember;
use App\Models\Reminder;
use App\Models\User;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

class ReminderService
{
    /**
     * FR-RE-01 / FR-RE-02: Create a reminder.
     * Recurring fields only accepted for Pro users (enforced in controller).
     */
    public function create(User $user, array $data): Reminder
    {
        // Validate target user is a member of the context
        if (!empty($data['user_id'])) {
            $this->ensureTargetIsMember($data['context_id'], $data['user_id']);
        }

        $recurrenceType     = $data['recurrence_type'] ?? 'none';
        $recurrenceInterval = $data['recurrence_interval'] ?? 1;

        // For recurring reminders set the first next_occurrence_at = remind_at
        $nextOccurrenceAt = $recurrenceType !== 'none'
            ? $data['remind_at']
            : null;

        return Reminder::create([
            'context_id'          => $data['context_id'],
            'created_by'          => $user->id,
            'user_id'             => $data['user_id'] ?? null,
            'title'               => $data['title'],
            'description'         => $data['description'] ?? null,
            'remind_at'           => $data['remind_at'],
            'recurrence_type'     => $recurrenceType,
            'recurrence_interval' => $recurrenceInterval,
            'next_occurrence_at'  => $nextOccurrenceAt,
            'is_completed'        => false,
        ]);
    }

    /**
     * Update a reminder's fields.
     */
    public function update(Reminder $reminder, array $data): Reminder
    {
        if (!empty($data['user_id'])) {
            $this->ensureTargetIsMember($reminder->context_id, $data['user_id']);
        }

        $reminder->update(array_filter([
            'user_id'             => array_key_exists('user_id', $data) ? $data['user_id'] : $reminder->user_id,
            'title'               => $data['title']               ?? $reminder->title,
            'description'         => $data['description']         ?? $reminder->description,
            'remind_at'           => $data['remind_at']           ?? $reminder->remind_at,
            'recurrence_type'     => $data['recurrence_type']     ?? $reminder->recurrence_type,
            'recurrence_interval' => $data['recurrence_interval'] ?? $reminder->recurrence_interval,
        ], fn($v) => $v !== null));

        return $reminder->fresh(['creator', 'targetUser']);
    }

    /**
     * FR-RE-05: Mark reminder as completed.
     * For recurring — also advance next_occurrence_at.
     */
    public function markComplete(Reminder $reminder): Reminder
    {
        if ($reminder->isRecurring()) {
            $reminder->advanceNextOccurrence();
        } else {
            $reminder->update(['is_completed' => true]);
        }

        return $reminder->fresh();
    }

    /**
     * FR-RE-06: List reminders for a context, filterable by status.
     */
    public function list(
        string $contextId,
        string $status  = 'pending',
        int    $perPage = 20
    ): LengthAwarePaginator {
        return Reminder::with([
                'creator:id,name,avatar_url',
                'targetUser:id,name,avatar_url',
            ])
            ->where('context_id', $contextId)
            ->when($status === 'pending',   fn($q) => $q->where('is_completed', false))
            ->when($status === 'completed', fn($q) => $q->where('is_completed', true))
            ->orderBy('remind_at')
            ->paginate($perPage);
    }

    /**
     * Hard delete — soft delete keeps audit trail.
     */
    public function delete(Reminder $reminder): void
    {
        $reminder->delete();
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private function ensureTargetIsMember(string $contextId, string $userId): void
    {
        $isMember = ContextMember::where('context_id', $contextId)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->exists();

        if (!$isMember) {
            throw ValidationException::withMessages([
                'user_id' => 'The target user is not an active member of this context.',
            ]);
        }
    }
}