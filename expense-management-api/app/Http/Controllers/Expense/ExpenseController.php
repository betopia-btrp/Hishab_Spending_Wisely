<?php

namespace App\Http\Controllers\Expense;

use App\Http\Controllers\Controller;
use App\Http\Requests\Expense\ExpenseFilterRequest;
use App\Http\Requests\Expense\StoreExpenseRequest;
use App\Http\Requests\Expense\UpdateExpenseRequest;
use App\Models\ContextMember;
use App\Models\Expense;
use App\Services\CategorySuggestionService;
use App\Services\ExpenseService;
use App\Services\ReceiptScanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * @OA\Tag(name="Expenses")
 */

class ExpenseController extends Controller
{
    public function __construct(
        private ExpenseService $expenseService,
        private CategorySuggestionService $categorySuggestion,
    ) {}

    /**
     * POST /api/expenses/suggest-category
     * AI-powered category suggestion from expense note text.
     */
    public function scanReceipt(Request $request, ReceiptScanService $scanner): JsonResponse
    {
        $request->validate([
            'image'    => 'required|string',
            'mime_type' => 'nullable|string|in:image/jpeg,image/png,image/webp',
        ]);

        $result = $scanner->scan($request->image, $request->mime_type ?? 'image/jpeg');

        if (!$result) {
            return response()->json([
                'message' => 'Could not extract data from receipt. Check GEMINI_API_KEY is configured or try a clearer image.',
            ], 422);
        }

        return response()->json($result);
    }

    public function suggestCategory(Request $request): JsonResponse
    {
        $request->validate(['note' => 'required|string|max:255']);

        $predictions = $this->categorySuggestion->suggest($request->note);

        return response()->json(['predictions' => $predictions]);
    }

    /**
     * GET /api/expenses?context_id=xxx
     * FR-EX-08: Paginated, filterable expense history.
     */

    /**
     * @OA\Get(
     *     path="/api/expenses",
     *     tags={"Expenses"},
     *     security={{"bearerAuth":{}}},
     *     summary="List expenses"
     * )
     */

    public function index(ExpenseFilterRequest $request): JsonResponse
    {
        $this->ensureContextAccess($request->context_id);

        $query = Expense::with([
                'category:id,name,icon',
                'creator:id,name,avatar_url',
                'splits.user:id,name,avatar_url',
            ])
            ->where('context_id', $request->context_id)
            ->when($request->date_from, fn($q) => $q->whereDate('expense_date', '>=', $request->date_from))
            ->when($request->date_to,   fn($q) => $q->whereDate('expense_date', '<=', $request->date_to))
            ->when($request->category_id, fn($q) => $q->where('category_id', $request->category_id))
            ->when($request->keyword, fn($q) => $q->where('note', 'ilike', "%{$request->keyword}%"))
            ->orderByDesc('expense_date')
            ->orderByDesc('created_at');

        $expenses = $query->paginate($request->per_page ?? 20);

        return response()->json($expenses);
    }

    /**
     * POST /api/expenses
     * FR-EX-01: Log a new expense.
     */

       /**
     * @OA\Post(
     *     path="/api/expenses",
     *     tags={"Expenses"},
     *     security={{"bearerAuth":{}}},
     *     summary="Create expense",
     *     @OA\RequestBody(
     *         @OA\JsonContent(
     *             required={"amount","category_id"},
     *             @OA\Property(property="amount", type="number", example=500),
     *             @OA\Property(property="category_id", type="string")
     *         )
     *     )
     * )
     */

    public function store(StoreExpenseRequest $request): JsonResponse
    {
        $this->ensureContextAccess($request->context_id);

        $expense = $this->expenseService->create(Auth::user(), $request->validated());

        return response()->json([
            'message' => 'Expense logged successfully.',
            'expense' => $expense,
        ], 201);
    }

    /**
     * GET /api/expenses/{expense}
     * View a single expense detail.
     */

        /**
     * @OA\Get(
     *     path="/api/expenses/{expense}",
     *     tags={"Expenses"},
     *     summary="Get expense",
     *     @OA\Parameter(name="expense", in="path", required=true, @OA\Schema(type="string"))
     * )
     */
    public function show(Expense $expense): JsonResponse
    {
        $this->authorize('view', $expense);

        $expense->load([
            'category:id,name,icon',
            'creator:id,name,avatar_url',
            'splits.user:id,name,avatar_url',
        ]);

        return response()->json($expense);
    }

    /**
     * PUT /api/expenses/{expense}
     * FR-EX-05: Edit expense (recalculates splits + balances atomically).
     */

        /**
     * @OA\Put(
     *     path="/api/expenses/{expense}",
     *     tags={"Expenses"},
     *     summary="Update expense"
     * )
     */

    public function update(UpdateExpenseRequest $request, Expense $expense): JsonResponse
    {
        $this->authorize('modify', $expense);

        $expense = $this->expenseService->update($expense, $request->validated());

        return response()->json([
            'message' => 'Expense updated successfully.',
            'expense' => $expense,
        ]);
    }

    /**
     * DELETE /api/expenses/{expense}
     * FR-EX-06: Delete expense (reverses balance changes atomically).
     */


    /**
     * @OA\Delete(
     *     path="/api/expenses/{expense}",
     *     tags={"Expenses"},
     *     summary="Delete expense"
     * )
     */
    public function destroy(Expense $expense): JsonResponse
    {
        $this->authorize('modify', $expense);

        $this->expenseService->delete($expense);

        return response()->json(['message' => 'Expense deleted successfully.']);
    }

    /**
     * PATCH /api/expenses/{expense}/settle
     * FR-EX-09: Mark expense as settled (does NOT delete it).
     */

    /**
     * @OA\Patch(
     *     path="/api/expenses/{expense}/settle",
     *     tags={"Expenses"},
     *     summary="Settle expense"
     * )
     */

    public function settle(Expense $expense): JsonResponse
    {
        $this->authorize('view', $expense);

        $expense = $this->expenseService->markSettled($expense);

        return response()->json([
            'message' => 'Expense marked as settled.',
            'expense' => $expense,
        ]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    private function ensureContextAccess(string $contextId): void
    {
        $isMember = ContextMember::where('context_id', $contextId)
            ->where('user_id', Auth::id())
            ->where('status', 'active')
            ->exists();

        abort_if(!$isMember, 403, 'You do not have access to this context.');
    }

}
