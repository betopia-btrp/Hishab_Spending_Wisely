<?php

namespace App\Http\Controllers;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Stripe\Checkout\Session;
use Stripe\Stripe;

class SubscriptionController extends Controller
{
    public function __construct()
    {
        Stripe::setApiKey(config('services.stripe.secret'));
    }

    public function plans(): JsonResponse
    {
        $plans = Plan::where('name', '!=', 'free')->get([
            'id', 'name', 'price_monthly', 'price_yearly',
            'stripe_price_monthly_id', 'stripe_price_yearly_id',
            'max_groups', 'max_members_per_group',
        ]);
        return response()->json($plans);
    }

    public function checkout(Request $request): JsonResponse
    {
        $request->validate([
            'price_id' => ['required', 'string'],
            'success_url' => ['required', 'string', 'regex:/^https?:\/\/[^\s]+$/'],
            'cancel_url' => ['required', 'string', 'regex:/^https?:\/\/[^\s]+$/'],
        ]);

        $user = Auth::user();

        $session = Session::create([
            'mode' => 'subscription',
            'payment_method_types' => ['card'],
            'line_items' => [[
                'price' => $request->price_id,
                'quantity' => 1,
            ]],
            'customer_email' => $user->email,
            'client_reference_id' => $user->id,
            'metadata' => [
                'user_id' => $user->id,
            ],
            'success_url' => $request->success_url,
            'cancel_url' => $request->cancel_url,
        ]);

        return response()->json([
            'session_id' => $session->id,
            'url' => $session->url,
        ]);
    }

    public function webhook(Request $request): JsonResponse
    {
        $payload = $request->getContent();
        $sigHeader = $request->header('Stripe-Signature');
        $endpointSecret = config('services.stripe.webhook_secret');

        if ($endpointSecret) {
            try {
                $event = \Stripe\Webhook::constructEvent($payload, $sigHeader, $endpointSecret);
            } catch (\UnexpectedValueException) {
                return response()->json(['error' => 'Invalid payload'], 400);
            } catch (\Stripe\Exception\SignatureVerificationException) {
                return response()->json(['error' => 'Invalid signature'], 400);
            }
        } else {
            $event = json_decode($payload);
            if (!$event || !isset($event->type)) {
                return response()->json(['error' => 'Invalid payload'], 400);
            }
        }

        match ($event->type) {
            'checkout.session.completed' => $this->handleCheckoutCompleted($event->data->object),
            'customer.subscription.deleted' => $this->handleSubscriptionDeleted($event->data->object),
            default => null,
        };

        return response()->json(['status' => 'ok']);
    }

    public function verifySession(Request $request): JsonResponse
    {
        $request->validate(['session_id' => ['required', 'string']]);

        try {
            $session = Session::retrieve($request->session_id);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Invalid session'], 400);
        }

        if ($session->payment_status !== 'paid' && $session->payment_status !== 'no_payment_required') {
            return response()->json(['error' => 'Payment not completed'], 400);
        }

        $user = Auth::user();
        if (!$user) {
            $user = User::find($session->metadata->user_id);
        }

        if (!$user) {
            return response()->json(['error' => 'User not found'], 404);
        }

        $proPlan = Plan::where('name', 'pro')->first();

        $user->update([
            'is_premium' => true,
            'plan_id' => $proPlan?->id,
            'stripe_customer_id' => $session->customer,
            'stripe_subscription_id' => $session->subscription,
        ]);

        return response()->json([
            'message' => 'Subscription activated successfully.',
            'user' => $user->fresh(),
        ]);
    }

    public function status(): JsonResponse
    {
        $user = Auth::user();
        return response()->json([
            'is_premium' => $user->is_premium,
            'plan' => $user->plan?->only(['name', 'max_groups', 'max_members_per_group']),
        ]);
    }

    private function handleCheckoutCompleted($session): void
    {
        $user = User::find($session->metadata->user_id);
        if (!$user) return;

        $proPlan = Plan::where('name', 'pro')->first();

        $user->update([
            'is_premium' => true,
            'plan_id' => $proPlan?->id,
            'stripe_customer_id' => $session->customer,
            'stripe_subscription_id' => $session->subscription,
        ]);
    }

    private function handleSubscriptionDeleted($subscription): void
    {
        $user = User::where('stripe_subscription_id', $subscription->id)->first();
        if (!$user) return;

        $freePlan = Plan::where('name', 'free')->first();
        $user->update([
            'is_premium' => false,
            'stripe_subscription_id' => null,
            'plan_id' => $freePlan?->id,
        ]);
    }
}
