"""
Linear fallback projection when Prophet doesn't have enough data.

Formula: projected_remaining = daily_rate * days_remaining

When current month has sparse data (<3 days), uses historical daily average
from the last 3 months as a better baseline.
"""


def linear_projection(spent_so_far, days_passed, days_remaining,
                      historical_daily_avg=None, n_days=None):
    """
    Estimate remaining spend.

    Args:
        spent_so_far: total amount spent so far this month
        days_passed:  number of days elapsed this month
        days_remaining: days left in the month
        historical_daily_avg: average daily spend from last 3 months (optional)

    Returns:
        projected_remaining (float)
    """
    if days_passed <= 0 or days_remaining <= 0:
        return 0.0

    # Use historical average when current data is too sparse
    # (< 3 unique days with expenses regardless of days passed)
    if n_days is not None and n_days < 3 and historical_daily_avg and historical_daily_avg > 0:
        daily_rate = historical_daily_avg
    elif days_passed > 0:
        daily_rate = spent_so_far / days_passed
    else:
        return 0.0

    return round(daily_rate * days_remaining, 2)
