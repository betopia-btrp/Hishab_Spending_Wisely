<?php

namespace App\Policies;

use App\Models\Expense;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class ExpensePolicy
{
    /**
     * FR-EX-05, FR-EX-06:
     * Only the expense creator OR the group admin can modify/delete.
     */
    public function modify(User $user, Expense $expense): bool
    {
        if ($expense->created_by === $user->id) {
            return true;
        }

        return ContextMember::where('context_id', $expense->context_id)
            ->where('user_id', $user->id)
            ->where('role', 'admin')
            ->where('status', 'active')
            ->exists();
    }

    /**
     * Any active member of the context can view expenses.
     */
    public function view(User $user, Expense $expense): bool
    {
        return ContextMember::where('context_id', $expense->context_id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
    }
}
