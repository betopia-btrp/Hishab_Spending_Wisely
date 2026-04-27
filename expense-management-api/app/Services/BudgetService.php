<?php

namespace App\Services;

use App\Models\Budget;
use App\Models\Expense;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BudgetService
{
    /**
     * FR-BU-01 / FR-BU-02: Create or fail if duplicate exists (FR-BU-04).
     */
    public function store(array $data): Budget
    {
        // FR-BU-04: Enforce unique constraint gracefully before hitting DB
        $exists = Budget::where('context_id', $data['context_id'])
            ->where('month', $data['month'])
            ->where('year', $data['year'])
            ->where(function ($q) use ($data) {
                if (isset($data['category_id']) && $data['category_id']) {
                    $q->where('category_id', $data['category_id']);
                } else {
                    $q->whereNull('category_id');
                }
            })
            ->exists();

        if ($exists) {
            $label = isset($data['category_id']) ? 'category budget' : 'overall budget';
            throw ValidationException::withMessages([
                'budget' => "A {$label} already exists for {$data['month']}/{$data['year']} in this context.",
            ]);
        }

        return Budget::create([
            'context_id'  => $data['context_id'],
            'category_id' => $data['category_id'] ?? null,
            'month'       => $data['month'],
            'year'        => $data['year'],
            'amount'      => $data['amount'],
        ]);
    }

    /**
     * FR-BU-01 / FR-BU-02: Update budget amount.
     */
    public function update(Budget $budget, float $amount): Budget
    {
        $budget->update(['amount' => $amount]);
        return $budget->fresh('category');
    }

    /**
     * FR-BU-03: Get all budgets for a context/month/year with consumed % calculated.
     */
    public function getBudgetsWithProgress(
        string $contextId,
        int    $month,
        int    $year
    ): array {
        $budgets = Budget::with('category:id,name,icon')
            ->where('context_id', $contextId)
            ->where('month', $month)
            ->where('year', $year)
            ->get();

        return $budgets->map(function (Budget $budget) use ($contextId, $month, $year) {
            $spent = $this->calculateSpent($contextId, $month, $year, $budget->category_id);

            $budgetAmount = (float) $budget->amount;
            $percentage   = $budgetAmount > 0
                ? round(($spent / $budgetAmount) * 100, 2)
                : 0;

            return [
                'id'            => $budget->id,
                'category'      => $budget->category,
                'category_id'   => $budget->category_id,
                'month'         => $budget->month,
                'year'          => $budget->year,
                'amount'        => $budgetAmount,
                'spent_amount'  => $spent,
                'remaining'     => round($budgetAmount - $spent, 2),
                'percentage'    => $percentage,
                'percentage_used' => $percentage,
                'status'        => $this->getBudgetStatus($percentage),
            ];
        })->toArray();
    }

    /**
     * Delete a budget entry.
     */
    public function delete(Budget $budget): void
    {
        $budget->delete();
    }

    // ─── Private Helpers ─────────────────────────────────────────────────

    /**
     * Sum all expenses in the context for the given month/year.
     * If category_id is set — filter by that category.
     * If null — sum ALL expenses (overall budget).
     */
    private function calculateSpent(
        string  $contextId,
        int     $month,
        int     $year,
        ?string $categoryId
    ): float {
        return (float) Expense::where('context_id', $contextId)
            ->whereYear('expense_date', $year)
            ->whereMonth('expense_date', $month)
            ->whereNull('deleted_at')
            ->when($categoryId, fn($q) => $q->where('category_id', $categoryId))
            ->sum('amount');
    }

    /**
     * Return a colour-coded status string for the frontend.
     */
    private function getBudgetStatus(float $percentage): string
    {
        return match(true) {
            $percentage >= 100 => 'exceeded',
            $percentage >= 80  => 'warning',
            default            => 'on_track',
        };
    }
}