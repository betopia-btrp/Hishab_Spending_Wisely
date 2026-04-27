<?php

namespace App\Policies;

use App\Models\ContextMember;
use App\Models\Reminder;
use App\Models\User;

class ReminderPolicy
{
    /**
     * Any active member of the context can view and create reminders.
     */
    public function access(User $user, string $contextId): bool
    {
        return ContextMember::where('context_id', $contextId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
    }

    /**
     * Only the creator or a group admin can edit or delete a reminder.
     */
    public function modify(User $user, Reminder $reminder): bool
    {
        if ($reminder->created_by === $user->id) {
            return true;
        }

        return ContextMember::where('context_id', $reminder->context_id)
            ->where('user_id', $user->id)
            ->where('role', 'admin')
            ->where('status', 'active')
            ->exists();
    }
}