<?php

namespace App\Services;

use App\Models\Category;
use App\Models\User;

class CategoryService
{
    /**
     * FR-EX-07: Return system categories + custom categories for the active context.
     */
    public function getForContext(string $contextId): object
    {
        $system = Category::whereNull('context_id')
            ->where('is_system', true)
            ->whereNull('deleted_at')
            ->orderBy('name')
            ->get();

        $custom = Category::where('context_id', $contextId)
            ->where('is_system', false)
            ->whereNull('deleted_at')
            ->orderBy('name')
            ->get();

        return (object) [
            'system' => $system,
            'custom' => $custom,
        ];
    }

    /**
     * FR-EX-07: Pro users create custom categories.
     */
    public function createCustom(User $user, array $data): Category
    {
        return Category::create([
            'context_id' => $data['context_id'],
            'created_by' => $user->id,
            'name'       => $data['name'],
            'icon'       => $data['icon'] ?? null,
            'is_system'  => false,
        ]);
    }

    /**
     * Delete a custom category (only creator, non-system).
     */
    public function delete(Category $category): void
    {
        $category->delete();
    }
}
