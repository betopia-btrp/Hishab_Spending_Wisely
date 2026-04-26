<?php

namespace App\Services;

use App\Models\Balance;
use App\Models\ContextMember;
use App\Models\Settlement;
use App\Models\User;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SettlementService
{
    public function __construct(private BalanceService $balanceService) {}

    /**
     * FR-BA-02: Balance summary for a group context.
     * Returns net owed amounts between all member pairs with human-readable direction.
     */
    public function getBalanceSummary(string $contextId, User $viewer): array
    {
        $balances = Balance::with([
                'fromUser:id,name,avatar_url',
                'toUser:id,name,avatar_url',
            ])
            ->where('context_id', $contextId)
            ->where('amount', '!=', 0)
            ->get();

        $summary = [];

        foreach ($balances as $balance) {
            $amount = (float) $balance->amount;

            if ($amount > 0) {
                // from_user owes to_user
                $summary[] = [
                    'debtor'   => $balance->fromUser,
                    'creditor' => $balance->toUser,
                    'amount'   => round($amount, 2),
                    'you_owe'  => $balance->from_user_id === $viewer->id,
                    'owed_to_you' => $balance->to_user_id === $viewer->id,
                ];
            } elseif ($amount < 0) {
                // to_user owes from_user (amount stored as negative)
                $summary[] = [
                    'debtor'      => $balance->toUser,
                    'creditor'    => $balance->fromUser,
                    'amount'      => round(abs($amount), 2),
                    'you_owe'     => $balance->to_user_id === $viewer->id,
                    'owed_to_you' => $balance->from_user_id === $viewer->id,
                ];
            }
        }

        // Also compute personal net for the viewer
        $youOweTotal  = collect($summary)->where('you_owe', true)->sum('amount');
        $owedToYouTotal = collect($summary)->where('owed_to_you', true)->sum('amount');

        return [
            'balances'        => $summary,
            'you_owe_total'   => round($youOweTotal, 2),
            'owed_to_you_total' => round($owedToYouTotal, 2),
            'net'             => round($owedToYouTotal - $youOweTotal, 2),
        ];
    }

    /**
     * FR-BA-03 / FR-BA-04: Record a settlement and atomically update the balance.
     */
    public function record(User $user, array $data): Settlement
    {
        // Validate that both payer and receiver are active members
        $this->ensureBothMembersActive(
            $data['context_id'],
            $data['payer_id'],
            $data['receiver_id']
        );

        return DB::transaction(function () use ($data) {
            $settlement = Settlement::create([
                'context_id'  => $data['context_id'],
                'payer_id'    => $data['payer_id'],
                'receiver_id' => $data['receiver_id'],
                'amount'      => $data['amount'],
                'method'      => $data['method'] ?? null,
                'note'        => $data['note'] ?? null,
            ]);

            // FR-BA-04: update balance row atomically
            $this->balanceService->applySettlement(
                contextId  : $data['context_id'],
                payerId    : $data['payer_id'],
                receiverId : $data['receiver_id'],
                amount     : (float) $data['amount']
            );

            return $settlement->load([
                'payer:id,name,avatar_url',
                'receiver:id,name,avatar_url',
            ]);
        });
    }

    /**
     * FR-BA-05: Paginated settlement history for a context.
     */
    public function getHistory(string $contextId, int $perPage = 20): LengthAwarePaginator
    {
        return Settlement::with([
                'payer:id,name,avatar_url',
                'receiver:id,name,avatar_url',
            ])
            ->where('context_id', $contextId)
            ->orderByDesc('created_at')
            ->paginate($perPage);
    }

    // ─── Private Helpers ──────────────────────────────────────────────────

    private function ensureBothMembersActive(
        string $contextId,
        string $payerId,
        string $receiverId
    ): void {
        $activeIds = ContextMember::where('context_id', $contextId)
            ->where('status', 'active')
            ->whereIn('user_id', [$payerId, $receiverId])
            ->pluck('user_id')
            ->toArray();

        if (!in_array($payerId, $activeIds)) {
            throw ValidationException::withMessages([
                'payer_id' => 'Payer is not an active member of this group.',
            ]);
        }

        if (!in_array($receiverId, $activeIds)) {
            throw ValidationException::withMessages([
                'receiver_id' => 'Receiver is not an active member of this group.',
            ]);
        }
    }
}