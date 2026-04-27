<?php

namespace App\Console\Commands;

use App\Models\Plan;
use Illuminate\Console\Command;
use Stripe\Price;
use Stripe\Product;
use Stripe\Stripe;

class SyncStripePrices extends Command
{
    protected $signature = 'stripe:sync-prices';
    protected $description = 'Create or update Stripe products and prices from the plans table';

    public function handle(): int
    {
        Stripe::setApiKey(config('services.stripe.secret'));

        if (!config('services.stripe.secret')) {
            $this->error('STRIPE_SECRET is not set in .env');
            return Command::FAILURE;
        }

        $plan = Plan::where('name', 'pro')->first();

        if (!$plan) {
            $this->error('Pro plan not found in database. Run PlanSeeder first.');
            return Command::FAILURE;
        }

        $this->info('Syncing SpendWise Pro plan to Stripe...');

        $product = $this->syncProduct($plan);

        $monthlyPrice = $this->syncPrice($product, $plan->price_monthly, 'month');
        $yearlyPrice = $this->syncPrice($product, $plan->price_yearly, 'year');

        $plan->update([
            'stripe_price_monthly_id' => $monthlyPrice->id,
            'stripe_price_yearly_id' => $yearlyPrice->id,
        ]);

        $this->info(" Done!");
        $this->newLine();
        $this->line(" Product:    {$product->id}");
        $this->line(" Monthly:    {$monthlyPrice->id}  (\${$plan->price_monthly}/mo)");
        $this->line(" Yearly:     {$yearlyPrice->id}  (\${$plan->price_yearly}/yr)");
        $this->newLine();
        $this->warn('Set these in your .env so the PlanSeeder picks them up next time:');
        $this->line("STRIPE_PRO_PRICE_MONTHLY={$monthlyPrice->id}");
        $this->line("STRIPE_PRO_PRICE_YEARLY={$yearlyPrice->id}");

        return Command::SUCCESS;
    }

    private function syncProduct(Plan $plan): Product
    {
        if ($plan->stripe_price_monthly_id) {
            $existingPrice = Price::retrieve($plan->stripe_price_monthly_id);
            return Product::retrieve($existingPrice->product);
        }

        return Product::create([
            'name' => 'SpendWise Pro',
            'description' => 'Unlimited groups and unlimited members.',
            'metadata' => ['plan_id' => $plan->id],
        ]);
    }

    private function syncPrice(Product $product, float $amount, string $interval): Price
    {
        return Price::create([
            'product' => $product->id,
            'unit_amount' => (int) ($amount * 100),
            'currency' => 'usd',
            'recurring' => ['interval' => $interval],
            'metadata' => ['plan_id' => $product->metadata->plan_id],
        ]);
    }
}
