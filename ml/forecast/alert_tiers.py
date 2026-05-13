"""
Three-tier budget alert logic.

Tiers (checked in order):
  1. OVERSPEND      — spent_so_far > budget
  2. ON_TRACK_EXCEED — projected total > budget
  3. EARLY_WARNING   — spent >= 50% of budget with >= 15 days left
"""


def evaluate(spent_so_far, projected_total, budget_amount, days_left, total_days):
    """
    Determine alert tier for a single budget line.

    Args:
        spent_so_far:     total amount spent this month (float)
        projected_total:  spent_so_far + forecasted_remaining (float)
        budget_amount:    budget cap for this category (float)
        days_left:        days remaining in the month (int)
        total_days:       total days in this month (int)

    Returns:
        alert_tier (str or None): one of
          "overspend", "on_track_exceed", "early_warning", or None
    """
    if budget_amount <= 0:
        return None

    # 1. Already overspent
    if spent_so_far > budget_amount:
        return "overspend"

    # 2. On track to exceed
    if projected_total > budget_amount:
        return "on_track_exceed"

    # 3. Early warning: halfway with plenty of month left
    if spent_so_far >= budget_amount * 0.5 and days_left >= 15:
        return "early_warning"

    return None
