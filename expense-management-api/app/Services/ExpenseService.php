<?php

namespace App\Services;

use App\Models\Context;
use App\Models\ContextMember;
use App\Models\Expense;
use App\Models\ExpenseSplit;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExpenseService
{
    public function __construct(private BalanceService $balanceService) {}

    // ─────────────────────────────────────────────────────────────────────
    // FR-EX-01: Log Expense
    // ─────────────────────────────────────────────────────────────────────
    public function create(User $user, array $data): Expense
    {
        return DB::transaction(function () use ($user, $data) {
            $expense = Expense::create([
                'context_id'   => $data['context_id'],
                'category_id'  => $data['category_id'] ?? null,
                'created_by'   => $user->id,
                'amount'       => $data['amount'],
                'expense_date' => $data['expense_date'],
                'note'         => $data['note'] ?? null,
                'split_type'   => $data['split_type'],
                'is_settled'   => false,
            ]);

            // Create splits if group expense
            if ($expense->split_type !== 'none') {
                $this->createSplits($expense, $data);
                $this->balanceService->applyExpense($expense->load('splits'));
            }

            return $expense->load(['category', 'creator:id,name,avatar_url', 'splits.user:id,name,avatar_url']);
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FR-EX-05: Edit Expense — recalculate splits + update balances atomically
    // ─────────────────────────────────────────────────────────────────────
    public function update(Expense $expense, array $data): Expense
    {
        return DB::transaction(function () use ($expense, $data) {
            // Reverse old balance effects before changing anything
            if ($expense->split_type !== 'none') {
                $this->balanceService->reverseExpense($expense->load('splits'));
            }

            // Delete old splits
            $expense->splits()->delete();

            // Update expense fields
            $expense->update([
                'category_id'  => $data['category_id']  ?? $expense->category_id,
                'amount'       => $data['amount']        ?? $expense->amount,
                'expense_date' => $data['expense_date']  ?? $expense->expense_date,
                'note'         => array_key_exists('note', $data) ? $data['note'] : $expense->note,
                'split_type'   => $data['split_type']    ?? $expense->split_type,
            ]);

            $expense->refresh();

            // Re-create splits and apply new balance effects
            if ($expense->split_type !== 'none') {
                $this->createSplits($expense, $data);
                $this->balanceService->applyExpense($expense->load('splits'));
            }

            return $expense->load(['category', 'creator:id,name,avatar_url', 'splits.user:id,name,avatar_url']);
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FR-EX-06: Delete Expense — reverse balance changes atomically
    // ─────────────────────────────────────────────────────────────────────
    public function delete(Expense $expense): void
    {
        DB::transaction(function () use ($expense) {
            if ($expense->split_type !== 'none') {
                $this->balanceService->reverseExpense($expense->load('splits'));
            }

            $expense->splits()->delete();
            $expense->delete(); // soft delete
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FR-EX-09: Mark as settled
    // ─────────────────────────────────────────────────────────────────────
    public function markSettled(Expense $expense): Expense
    {
        $expense->update(['is_settled' => true]);
        return $expense->fresh();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal: Create splits based on split_type
    // ─────────────────────────────────────────────────────────────────────
    private function createSplits(Expense $expense, array $data): void
    {
        match ($expense->split_type) {
            'equal'      => $this->createEqualSplits($expense),
            'custom'     => $this->createCustomSplits($expense, $data['splits']),
            'percentage' => $this->createPercentageSplits($expense, $data['splits']),
            default      => null,
        };
    }

    /**
     * FR-EX-02: Equal split among all active group members.
     */
    private function createEqualSplits(Expense $expense): void
    {
        $members = ContextMember::where('context_id', $expense->context_id)
            ->where('status', 'active')
            ->pluck('user_id');

        if ($members->isEmpty()) {
            throw ValidationException::withMessages([
                'split_type' => 'No active members found in this group to split with.',
            ]);
        }

        $share = round($expense->amount / $members->count(), 2);

        // Handle rounding remainder — assign to the expense creator
        $totalDistributed = $share * $members->count();
        $remainder        = round($expense->amount - $totalDistributed, 2);

        foreach ($members as $userId) {
            $memberShare = $share;

            if ($userId === $expense->created_by && $remainder != 0) {
                $memberShare = round($memberShare + $remainder, 2);
            }

            ExpenseSplit::create([
                'expense_id'   => $expense->id,
                'user_id'      => $userId,
                'share_amount' => $memberShare,
                'percentage'   => null,
            ]);
        }
    }

    /**
     * FR-EX-03: Custom split — each member has a specified amount.
     */
    private function createCustomSplits(Expense $expense, array $splits): void
    {
        $totalSplit = collect($splits)->sum('share_amount');

        if (round($totalSplit, 2) !== round($expense->amount, 2)) {
            throw ValidationException::withMessages([
                'splits' => "Custom split amounts must sum to the total expense amount ({$expense->amount}). Got {$totalSplit}.",
            ]);
        }

        foreach ($splits as $split) {
            ExpenseSplit::create([
                'expense_id'   => $expense->id,
                'user_id'      => $split['user_id'],
                'share_amount' => $split['share_amount'],
                'percentage'   => null,
            ]);
        }
    }

    /**
     * FR-EX-04: Percentage split — must sum to 100%.
     */
    private function createPercentageSplits(Expense $expense, array $splits): void
    {
        $totalPercentage = collect($splits)->sum('percentage');

        if (round($totalPercentage, 2) !== 100.00) {
            throw ValidationException::withMessages([
                'splits' => "Percentage splits must sum to 100%. Got {$totalPercentage}%.",
            ]);
        }

        foreach ($splits as $split) {
            $shareAmount = round(($split['percentage'] / 100) * $expense->amount, 2);

            ExpenseSplit::create([
                'expense_id'   => $expense->id,
                'user_id'      => $split['user_id'],
                'share_amount' => $shareAmount,
                'percentage'   => $split['percentage'],
            ]);
        }
    }
}
