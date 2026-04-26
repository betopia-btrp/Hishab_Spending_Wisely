<?php

namespace App\Http\Controllers\Context;

use App\Http\Controllers\Controller;
use App\Http\Requests\Context\CreateGroupRequest;
use App\Http\Requests\Context\JoinGroupRequest;
use App\Http\Requests\Context\TransferAdminRequest;
use App\Models\Context;
use App\Models\ContextMember;
use App\Services\ContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
/**
 * @OA\Tag(name="Context")
 */
class ContextController extends Controller
{
    public function __construct(private ContextService $contextService) {}

    /**
     * GET /api/contexts
     * FR-CT-06: Returns personal context + all group contexts the user belongs to.
     */

    /**
     * @OA\Get(
     *     path="/api/contexts",
     *     tags={"Context"},
     *     summary="List contexts"
     * )
     */
    public function index(): JsonResponse
    {
        $contexts = $this->contextService->getUserContexts(Auth::user());

        return response()->json($contexts);
    }

    /**
     * POST /api/contexts/groups
     * FR-CT-02, FR-CT-04, FR-CT-07
     */

    /**
     * @OA\Post(
     *     path="/api/contexts/groups",
     *     tags={"Context"},
     *     summary="Create group"
     * )
     */

    public function createGroup(CreateGroupRequest $request): JsonResponse
    {
        $context = $this->contextService->createGroup(
            Auth::user(),
            $request->validated()
        );

        $inviteLink = url("/api/contexts/join?code={$context->invite_code}");

        return response()->json([
            'message'     => 'Group created successfully.',
            'context'     => $context,
            'invite_code' => $context->invite_code,
            'invite_link' => $inviteLink,
        ], 201);
    }

    /**
     * POST /api/contexts/join
     * FR-CT-03, FR-CT-08
     */

    /**
     * @OA\Post(
     *     path="/api/contexts/join",
     *     tags={"Context"},
     *     summary="Join group"
     * )
     */

    public function joinGroup(JoinGroupRequest $request): JsonResponse
    {
        $context = $this->contextService->joinGroup(
            Auth::user(),
            $request->input('invite_code')
        );

        return response()->json([
            'message' => 'Join request sent. Waiting for admin approval.',
            'context' => $context,
        ], 200);
    }

    /**
     * GET /api/contexts/{context}
     * View a single context detail.
     */

    /**
     * @OA\Get(
     *     path="/api/contexts/{context}",
     *     tags={"Context"},
     *     summary="Get context"
     * )
     */

    public function show(Context $context): JsonResponse
    {
        $this->authorizeContextAccess($context);

        $context->load([
            'members' => fn($q) => $q->where('status', 'active')->with('user:id,name,email,avatar_url'),
            'pendingMembers.user:id,name,email,avatar_url',
        ]);

        return response()->json($context);
    }

    /**
     * POST /api/contexts/{context}/approve/{userId}
     * FR-CT-05: Admin approves a pending member.
     */

        /**
     * @OA\Post(
     *     path="/api/contexts/{context}/approve/{userId}",
     *     tags={"Context"},
     *     summary="Approve member"
     * )
     */

    public function approveMember(Context $context, string $userId): JsonResponse
    {
        $this->authorize('manage', $context);

        $member = $this->contextService->approveMember($context, $userId);

        return response()->json([
            'message' => 'Member approved.',
            'member'  => $member,
        ]);
    }

    /**
     * DELETE /api/contexts/{context}/members/{userId}
     * FR-CT-05: Admin removes a member.
     */

    /**
     * @OA\Delete(
     *     path="/api/contexts/{context}/members/{userId}",
     *     tags={"Context"},
     *     summary="Remove member"
     * )
     */

    public function removeMember(Context $context, string $userId): JsonResponse
    {
        $this->authorize('manage', $context);

        $this->contextService->removeMember($context, $userId);

        return response()->json(['message' => 'Member removed successfully.']);
    }

    /**
     * POST /api/contexts/{context}/transfer-admin
     * FR-CT-05: Transfer admin rights.
     */

    /**
     * @OA\Post(
     *     path="/api/contexts/{context}/transfer-admin",
     *     tags={"Context"},
     *     summary="Transfer admin"
     * )
     */

    public function transferAdmin(Context $context, TransferAdminRequest $request): JsonResponse
    {
        $this->authorize('manage', $context);

        $this->contextService->transferAdmin(
            $context,
            Auth::user(),
            $request->input('user_id')
        );

        return response()->json(['message' => 'Admin rights transferred successfully.']);
    }

    /**
     * POST /api/contexts/{context}/revoke-invite
     * FR-CT-05: Admin revokes the invite code (generates a new one).
     */

    /**
     * @OA\Post(
     *     path="/api/contexts/{context}/revoke-invite",
     *     tags={"Context"},
     *     summary="Revoke invite"
     * )
     */

    public function revokeInviteCode(Context $context): JsonResponse
    {
        $this->authorize('manage', $context);

        $context = $this->contextService->revokeInviteCode($context);

        $inviteLink = url("/api/contexts/join?code={$context->invite_code}");

        return response()->json([
            'message'     => 'Invite code revoked. New code generated.',
            'invite_code' => $context->invite_code,
            'invite_link' => $inviteLink,
        ]);
    }

    // ─── Helper ────────────────────────────────────────────────────────────

    /**
     * Ensure the authenticated user is an active member of the context.
     */
    private function authorizeContextAccess(Context $context): void
    {
        $isMember = ContextMember::where('context_id', $context->id)
            ->where('user_id', Auth::id())
            ->where('status', 'active')
            ->exists();

        abort_if(!$isMember, 403, 'You do not have access to this context.');
    }
}
