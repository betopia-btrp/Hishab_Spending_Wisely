<?php

namespace App\Http\Controllers\Reminder;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reminder\ListReminderRequest;
use App\Http\Requests\Reminder\StoreReminderRequest;
use App\Http\Requests\Reminder\UpdateReminderRequest;
use App\Models\ContextMember;
use App\Models\Reminder;
use App\Services\ActivityLogService;
use App\Services\ReminderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class ReminderController extends Controller
{
    public function __construct(
        private ReminderService    $reminderService,
        private ActivityLogService $activityLogService
    ) {}

    /**
     * GET /api/reminders?context_id=xxx&status=pending
     * FR-RE-06: List pending and completed reminders.
     */
    public function index(ListReminderRequest $request): JsonResponse
    {
        $this->ensureActiveMember($request->context_id);

        $reminders = $this->reminderService->list(
            $request->context_id,
            $request->status   ?? 'pending',
            $request->per_page ?? 20,
        );

        return response()->json($reminders);
    }

    /**
     * POST /api/reminders
     * FR-RE-01 / FR-RE-02: Create a one-shot or recurring reminder.
     */
    public function store(StoreReminderRequest $request): JsonResponse
    {
        $this->ensureActiveMember($request->context_id);

        // FR-RE-02: Recurring reminders are Pro-only
        $recurrenceType = $request->input('recurrence_type', 'none');
        if ($recurrenceType !== 'none' && !Auth::user()->is_premium) {
            return response()->json([
                'message' => 'Recurring reminders are available for Pro users only. Please upgrade your plan.',
            ], 403);
        }

        $reminder = $this->reminderService->create(Auth::user(), $request->validated());

        // Activity log
        $this->activityLogService->log(
            contextId : $request->context_id,
            userId    : Auth::id(),
            action    : 'reminder.created',
            subject   : $reminder,
            metadata  : [
                'title'            => $reminder->title,
                'remind_at'        => $reminder->remind_at->toISOString(),
                'recurrence_type'  => $reminder->recurrence_type,
                'target_user_id'   => $reminder->user_id,
            ]
        );

        return response()->json([
            'message'  => 'Reminder created successfully.',
            'reminder' => $reminder->load(['creator:id,name,avatar_url', 'targetUser:id,name,avatar_url']),
        ], 201);
    }

    /**
     * GET /api/reminders/{reminder}
     */
    public function show(Reminder $reminder): JsonResponse
    {
        $this->ensureActiveMember($reminder->context_id);

        return response()->json(
            $reminder->load(['creator:id,name,avatar_url', 'targetUser:id,name,avatar_url'])
        );
    }

    /**
     * PUT /api/reminders/{reminder}
     * FR-RE-05 (edit fields)
     */
    public function update(UpdateReminderRequest $request, Reminder $reminder): JsonResponse
    {
        $this->authorize('modify', $reminder);

        // Recurring fields still need Pro check
        $recurrenceType = $request->input('recurrence_type', $reminder->recurrence_type);
        if ($recurrenceType !== 'none' && !Auth::user()->is_premium) {
            return response()->json([
                'message' => 'Recurring reminders are available for Pro users only.',
            ], 403);
        }

        $reminder = $this->reminderService->update($reminder, $request->validated());

        return response()->json([
            'message'  => 'Reminder updated.',
            'reminder' => $reminder,
        ]);
    }

    /**
     * PATCH /api/reminders/{reminder}/complete
     * FR-RE-05: Mark as completed. Recurring reminders auto-advance.
     */
    public function complete(Reminder $reminder): JsonResponse
    {
        $this->ensureActiveMember($reminder->context_id);

        $reminder = $this->reminderService->markComplete($reminder);

        $this->activityLogService->log(
            contextId : $reminder->context_id,
            userId    : Auth::id(),
            action    : 'reminder.completed',
            subject   : $reminder,
        );

        return response()->json([
            'message'  => $reminder->isRecurring()
                ? 'Reminder completed. Next occurrence scheduled.'
                : 'Reminder marked as completed.',
            'reminder' => $reminder,
        ]);
    }

    /**
     * DELETE /api/reminders/{reminder}
     */
    public function destroy(Reminder $reminder): JsonResponse
    {
        $this->authorize('modify', $reminder);

        $this->reminderService->delete($reminder);

        return response()->json(['message' => 'Reminder deleted.']);
    }

    // ─── Helper ──────────────────────────────────────────────────────────

    private function ensureActiveMember(string $contextId): void
    {
        abort_if(
            !ContextMember::where('context_id', $contextId)
                ->where('user_id', Auth::id())
                ->where('status', 'active')
                ->exists(),
            403,
            'You do not have access to this context.'
        );
    }
}