<?php

namespace App\Policies;

use App\Models\Category;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class CategoryPolicy
{
    /**
     * Only the creator can delete their custom category.
     */
    public function delete(User $user, Category $category): bool
    {
        return !$category->is_system && $category->created_by === $user->id;
    }
}
