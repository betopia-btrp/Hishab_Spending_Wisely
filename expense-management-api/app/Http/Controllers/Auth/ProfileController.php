<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\UpdateProfileRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * @OA\Tag(name="Profile")
 */

class ProfileController extends Controller
{
    /**
     * PATCH /api/auth/profile
     */

        /**
     * @OA\Patch(
     *     path="/api/auth/profile",
     *     tags={"Profile"},
     *     security={{"bearerAuth":{}}},
     *     summary="Update profile"
     * )
     */

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = Auth::guard('api')->user();
        $user->update($request->validated());

        return response()->json([
            'message' => 'Profile updated successfully.',
            'user'    => $user->fresh(),
        ]);
    }
}

