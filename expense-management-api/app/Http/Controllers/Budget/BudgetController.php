<?php

namespace App\Http\Controllers\Budget;

use App\Http\Controllers\Controller;
use App\Http\Requests\Budget\StoreBudgetRequest;
use App\Http\Requests\Budget\UpdateBudgetRequest;
use App\Models\Budget;
use App\Models\ContextMember;
use App\Services\BudgetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * @OA\Tag(
 *     name="Budgets",
 *     description="Budget management APIs"
 * )
 */

class BudgetController extends Controller
{
    public function __construct(private BudgetService $budgetService) {}

    /**
     * GET /api/budgets?context_id=xxx&month=1&year=2025
     * FR-BU-03: Return budgets with consumed % for the month.
     */

    /**
     * @OA\Get(
     *     path="/api/budgets",
     *     tags={"Budgets"},
     *     security={{"bearerAuth":{}}},
     *     summary="List budgets",
     *     @OA\Parameter(name="context_id", in="query", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Parameter(name="month", in="query", required=true, @OA\Schema(type="integer", minimum=1, maximum=12)),
     *     @OA\Parameter(name="year", in="query", required=true, @OA\Schema(type="integer", minimum=2000, maximum=2100)),
     *     @OA\Response(response=200, description="Budgets retrieved")
     * )
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'context_id' => ['required', 'uuid', 'exists:contexts,id'],
            'month'      => ['required', 'integer', 'between:1,12'],
            'year'       => ['required', 'integer', 'min:2000', 'max:2100'],
        ]);

        $this->ensureActiveMember($request->context_id);

        $budgets = $this->budgetService->getBudgetsWithProgress(
            $request->context_id,
            (int) $request->month,
            (int) $request->year
        );

        return response()->json([
            'month'   => $request->month,
            'year'    => $request->year,
            'budgets' => $budgets,
        ]);
    }

    /**
     * POST /api/budgets
     * FR-BU-01 / FR-BU-02: Set overall or category budget.
     */

    /**
     * @OA\Post(
     *     path="/api/budgets",
     *     tags={"Budgets"},
     *     security={{"bearerAuth":{}}},
     *     summary="Create budget",
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"context_id","month","year","amount"},
     *             @OA\Property(property="context_id", type="string", format="uuid"),
     *             @OA\Property(property="month", type="integer"),
     *             @OA\Property(property="year", type="integer"),
     *             @OA\Property(property="amount", type="number"),
     *             @OA\Property(property="category_id", type="string", format="uuid", nullable=true)
     *         )
     *     ),
     *     @OA\Response(response=201, description="Budget created")
     * )
     */
    public function store(StoreBudgetRequest $request): JsonResponse
    {
        $this->ensureCanManage($request->context_id);

        $budget = $this->budgetService->store($request->validated());

        return response()->json([
            'message' => 'Budget set successfully.',
            'budget'  => $budget->load('category:id,name,icon'),
        ], 201);
    }

    /**
     * PUT /api/budgets/{budget}
     * Update budget amount only (month/year/context cannot change — delete and recreate instead).
     */

    /**
     * @OA\Put(
     *     path="/api/budgets/{budget}",
     *     tags={"Budgets"},
     *     security={{"bearerAuth":{}}},
     *     summary="Update budget",
     *     @OA\Parameter(name="budget", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"amount"},
     *             @OA\Property(property="amount", type="number")
     *         )
     *     ),
     *     @OA\Response(response=200, description="Budget updated")
     * )
     */
    public function update(UpdateBudgetRequest $request, Budget $budget): JsonResponse
    {
        $this->ensureCanManage($budget->context_id);

        $budget = $this->budgetService->update($budget, (float) $request->amount);

        return response()->json([
            'message' => 'Budget updated successfully.',
            'budget'  => $budget,
        ]);
    }

    /**
     * DELETE /api/budgets/{budget}
     */

    /**
     * @OA\Delete(
     *     path="/api/budgets/{budget}",
     *     tags={"Budgets"},
     *     security={{"bearerAuth":{}}},
     *     summary="Delete budget",
     *     @OA\Parameter(name="budget", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(response=200, description="Budget deleted")
     * )
     */
    public function destroy(Budget $budget): JsonResponse
    {
        $this->ensureCanManage($budget->context_id);

        $this->budgetService->delete($budget);

        return response()->json(['message' => 'Budget deleted.']);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    private function ensureActiveMember(string $contextId): void
    {
        abort_if(
            !ContextMember::where('context_id', $contextId)
                ->where('user_id', Auth::id())
                ->where('status', 'active')
                ->exists(),
            403,
            'You do not have access to this context.'
        );
    }

    private function ensureCanManage(string $contextId): void
    {
        $member = ContextMember::where('context_id', $contextId)
            ->where('user_id', Auth::id())
            ->where('status', 'active')
            ->with('context:id,type')
            ->first();

        abort_if(!$member, 403, 'You are not a member of this context.');

        $isPersonal  = $member->context->type === 'personal';
        $isGroupAdmin = $member->role === 'admin';

        abort_if(
            !$isPersonal && !$isGroupAdmin,
            403,
            'Only group admins can manage group budgets.'
        );
    }
}