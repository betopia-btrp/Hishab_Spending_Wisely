<?php

namespace App\Http\Controllers\Balance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Balance\RecordSettlementRequest;
use App\Models\ContextMember;
use App\Services\SettlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * @OA\Tag(
 *     name="Balances",
 *     description="Balance and settlement management APIs"
 * )
 */

class BalanceController extends Controller
{
    public function __construct(private SettlementService $settlementService) {}

    /**
     * GET /api/balances/summary?context_id=xxx
     * FR-BA-02: Balance summary showing who owes whom.
     */

    /**
     * @OA\Get(
     *     path="/api/balances/summary",
     *     tags={"Balances"},
     *     security={{"bearerAuth":{}}},
     *     summary="Get balance summary",
     *     @OA\Parameter(name="context_id", in="query", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(response=200, description="Balance summary retrieved")
     * )
     */
    public function summary(Request $request): JsonResponse
    {
        $request->validate([
            'context_id' => ['required', 'uuid', 'exists:contexts,id'],
        ]);

        $this->ensureActiveMember($request->context_id);

        $summary = $this->settlementService->getBalanceSummary(
            $request->context_id,
            Auth::user()
        );

        return response()->json($summary);
    }

    /**
     * POST /api/balances/settlements
     * FR-BA-03 / FR-BA-04: Record a settlement and update balance atomically.
     */

    /**
     * @OA\Post(
     *     path="/api/balances/settlements",
     *     tags={"Balances"},
     *     security={{"bearerAuth":{}}},
     *     summary="Record settlement",
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"context_id","amount","settled_by"},
     *             @OA\Property(property="context_id", type="string", format="uuid"),
     *             @OA\Property(property="amount", type="number"),
     *             @OA\Property(property="settled_by", type="string", format="uuid", description="User ID who settled")
     *         )
     *     ),
     *     @OA\Response(response=201, description="Settlement recorded")
     * )
     */
    public function recordSettlement(RecordSettlementRequest $request): JsonResponse
    {
        $this->ensureActiveMember($request->context_id);

        $settlement = $this->settlementService->record(Auth::user(), $request->validated());

        return response()->json([
            'message'    => 'Settlement recorded successfully.',
            'settlement' => $settlement,
        ], 201);
    }

    /**
     * GET /api/balances/settlements?context_id=xxx
     * FR-BA-05: Full settlement history for the context.
     */

    /**
     * @OA\Get(
     *     path="/api/balances/settlements",
     *     tags={"Balances"},
     *     security={{"bearerAuth":{}}},
     *     summary="Get settlement history",
     *     @OA\Parameter(name="context_id", in="query", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Parameter(name="per_page", in="query", required=false, @OA\Schema(type="integer")),
     *     @OA\Response(response=200, description="Settlement history retrieved")
     * )
     */
    public function settlementHistory(Request $request): JsonResponse
    {
        $request->validate([
            'context_id' => ['required', 'uuid', 'exists:contexts,id'],
            'per_page'   => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $this->ensureActiveMember($request->context_id);

        $history = $this->settlementService->getHistory(
            $request->context_id,
            $request->per_page ?? 20
        );

        return response()->json($history);
    }

    // ─── Helper ──────────────────────────────────────────────────────────

    private function ensureActiveMember(string $contextId): void
    {
        $isMember = ContextMember::where('context_id', $contextId)
            ->where('user_id', Auth::id())
            ->where('status', 'active')
            ->exists();

        abort_if(!$isMember, 403, 'You do not have access to this context.');
    }
}