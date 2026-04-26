<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Laravel\Socialite\Facades\Socialite;
use Tymon\JWTAuth\Facades\JWTAuth;
use Throwable;

/**
 * @OA\Tag(
 *     name="OAuth",
 *     description="OAuth authentication APIs"
 * )
 */

class OAuthController extends Controller
{
    public function __construct(private AuthService $authService) {}

    /**
     * GET /api/auth/google/redirect
     * Returns the Google OAuth redirect URL for the frontend to navigate to.
     */

    /**
     * @OA\Get(
     *     path="/api/auth/google/redirect",
     *     tags={"OAuth"},
     *     summary="Redirect to Google OAuth"
     * )
     */
    public function redirectToGoogle(): JsonResponse
    {
        $url = Socialite::driver('google')->stateless()->redirect()->getTargetUrl();

        return response()->json(['redirect_url' => $url]);
    }

    /**
     * GET /api/auth/google/callback
     * Google redirects here after user grants permission.
     */

    /**
     * @OA\Get(
     *     path="/api/auth/google/callback",
     *     tags={"OAuth"},
     *     summary="Handle Google OAuth callback"
     * )
     */
    public function handleGoogleCallback(): JsonResponse
    {
        try {
            $googleUser = Socialite::driver('google')->stateless()->user();
        } catch (Throwable $e) {
            return response()->json([
                'message' => 'Google authentication failed. Please try again.',
            ], 422);
        }

        $user  = $this->authService->findOrCreateFromGoogle($googleUser);
        $token = JWTAuth::fromUser($user);

        return response()->json([
            'user'        => $user,
            'token'       => $token,
            'token_type'  => 'bearer',
            'expires_in'  => config('jwt.ttl') * 60,
        ]);
    }
}