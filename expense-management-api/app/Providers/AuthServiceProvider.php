<?php

namespace App\Providers;

use App\Models\Context;
use App\Policies\ContextPolicy;
use App\Policies\CategoryPolicy;
use App\Policies\ExpensePolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        Context::class => ContextPolicy::class,
        Expense::class  => ExpensePolicy::class,
        Category::class => CategoryPolicy::class,
        Settlement::class => SettlementPolicy::class,
        Budget::class     => BudgetPolicy::class
    ];

    public function boot(): void
    {
        $this->registerPolicies();
    }
}
