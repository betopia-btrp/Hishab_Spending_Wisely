<?php

namespace App\Http\Controllers\Expense;

use App\Http\Controllers\Controller;
use App\Http\Requests\Expense\StoreCategoryRequest;
use App\Models\Category;
use App\Services\CategoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * @OA\Tag(name="Categories")
 */

class CategoryController extends Controller
{
    public function __construct(private CategoryService $categoryService) {}

    /**
     * GET /api/categories?context_id=xxx
     * FR-EX-07: Return system + custom categories for the context.
     */

        /**
     * @OA\Get(
     *     path="/api/categories",
     *     tags={"Categories"},
     *     summary="List categories"
     * )
     */

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'context_id' => ['required', 'uuid', 'exists:contexts,id'],
        ]);

        $categories = $this->categoryService->getForContext($request->context_id);

        return response()->json($categories);
    }

    /**
     * POST /api/categories
     * FR-EX-07: Pro users create custom categories.
     */

        /**
     * @OA\Post(
     *     path="/api/categories",
     *     tags={"Categories"},
     *     summary="Create category"
     * )
     */

    public function store(StoreCategoryRequest $request): JsonResponse
    {
        $this->authorize('create', Category::class);

        $category = $this->categoryService->createCustom(
            Auth::user(),
            $request->validated()
        );

        return response()->json([
            'message'  => 'Category created.',
            'category' => $category,
        ], 201);
    }

    /**
     * DELETE /api/categories/{category}
     */

    /**
     * @OA\Delete(
     *     path="/api/categories/{category}",
     *     tags={"Categories"},
     *     summary="Delete category"
     * )
     */

    public function destroy(Category $category): JsonResponse
    {
        $this->authorize('delete', $category);

        $this->categoryService->delete($category);

        return response()->json(['message' => 'Category deleted.']);
    }
}
