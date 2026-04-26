<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;
/**
 * @OA\Tag(name="Password Reset")
 */
class PasswordResetController extends Controller
{
    /**
     * POST /api/auth/forgot-password
     * Sends a password reset link to the user's email.
     */

     /**
     * @OA\Post(
     *     path="/api/auth/forgot-password",
     *     tags={"Password Reset"},
     *     summary="Forgot password"
     * )
     */
    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        $status = Password::sendResetLink($request->only('email'));

        if ($status !== Password::RESET_LINK_SENT) {
            return response()->json([
                'message' => __($status),
            ], 422);
        }

        return response()->json([
            'message' => 'Password reset link sent to your email.',
        ]);
    }

    /**
     * POST /api/auth/reset-password
     * Validates the token and resets the password.
     */


    /**
     * @OA\Post(
     *     path="/api/auth/reset-password",
     *     tags={"Password Reset"},
     *     summary="Reset password"
     * )
     */
    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user, $password) {
                $user->forceFill(['password' => $password])->save();
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'message' => __($status),
            ], 422);
        }

        return response()->json([
            'message' => 'Password reset successfully. Please log in.',
        ]);
    }
}

