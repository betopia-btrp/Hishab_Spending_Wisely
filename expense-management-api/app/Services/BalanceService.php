<?php

namespace App\Services;

use App\Models\Balance;
use App\Models\Expense;
use App\Models\ExpenseSplit;
use Illuminate\Support\Collection;

class BalanceService
{
    /**
     * Recalculate balances after a new expense is created.
     * The expense payer (created_by) is owed money by all other members.
     *
     * Called inside DB::transaction() from ExpenseService.
     */
    public function applyExpense(Expense $expense): void
    {
        if (in_array($expense->split_type, ['none'])) {
            return; // personal expense — no balance changes
        }

        $payer  = $expense->created_by;
        $splits = $expense->splits;

        foreach ($splits as $split) {
            if ($split->user_id === $payer) {
                continue; // payer's own share — skip
            }

            // The split member owes the payer
            $this->adjustBalance(
                contextId  : $expense->context_id,
                debtorId   : $split->user_id,   // owes money
                creditorId : $payer,             // is owed money
                amount     : $split->share_amount
            );
        }
    }

    /**
     * Reverse all balance effects of an expense.
     * Called before deletion or before re-applying updated splits.
     *
     * Called inside DB::transaction() from ExpenseService.
     */
    public function reverseExpense(Expense $expense): void
    {
        if ($expense->split_type === 'none') {
            return;
        }

        $payer  = $expense->created_by;
        $splits = $expense->splits;

        foreach ($splits as $split) {
            if ($split->user_id === $payer) {
                continue;
            }

            // Reverse: creditor now owes the debtor (negate the original)
            $this->adjustBalance(
                contextId  : $expense->context_id,
                debtorId   : $payer,             // was owed — now reversed
                creditorId : $split->user_id,    // was owing — now reversed
                amount     : $split->share_amount
            );
        }
    }

    /**
     * Core balance updater.
     * Always stores canonical row: from_user_id = lower UUID.
     *
     * If debtor < creditor: amount += share  (debtor owes creditor)
     * If debtor > creditor: amount -= share  (creditor owes debtor in the canonical row)
     */
    public function adjustBalance(
        string $contextId,
        string $debtorId,
        string $creditorId,
        float  $amount
    ): void {
        // Canonical: lower UUID is always from_user_id
        $isCanonical = strcmp($debtorId, $creditorId) < 0;

        $fromUserId = $isCanonical ? $debtorId   : $creditorId;
        $toUserId   = $isCanonical ? $creditorId : $debtorId;
        $delta      = $isCanonical ? $amount      : -$amount;

        // upsert: create row if not exists, then increment atomically
        $balance = Balance::firstOrCreate(
            [
                'context_id'   => $contextId,
                'from_user_id' => $fromUserId,
                'to_user_id'   => $toUserId,
            ],
            ['amount' => 0]
        );

        $balance->increment('amount', $delta);
    }

    /**
 * FR-BA-04: Update balance when a settlement is recorded.
 * Settlement means payer has paid receiver — reduces what payer owes receiver.
 *
 * Called inside DB::transaction() from SettlementService.
 */
public function applySettlement(
    string $contextId,
    string $payerId,
    string $receiverId,
    float  $amount
): void {
    // Settlement: payer clears their debt to receiver.
    // This is the reverse of applyExpense — the payer was the debtor.
    // So we adjust: receiver "owes" payer by this amount (netting it out).
    $this->adjustBalance(
        contextId  : $contextId,
        debtorId   : $receiverId, // the one who was owed — now being paid
        creditorId : $payerId,    // the one who paid — debt reduces
        amount     : $amount
    );
}

}
