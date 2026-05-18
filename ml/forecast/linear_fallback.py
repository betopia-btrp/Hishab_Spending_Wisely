"""
Linear fallback projection when Prophet doesn't have enough data.

Logic (in order):
  1. If current month has ≥3 expense days → use current month's daily rate
  2. If current month has 1-2 expense days AND historical avg exists → use historical avg
  3. Otherwise → 0
"""


def linear_projection(spent_so_far, days_passed, days_remaining,
                      historical_daily_avg=None, n_days=None):
    """
    Estimate remaining spend.

    Args:
        spent_so_far: total amount spent so far this month
        days_passed:  number of days elapsed this month
        days_remaining: days left in the month
        historical_daily_avg: average daily spend from last 3 months
        n_days: number of unique days with expenses this month

    Returns:
        projected_remaining (float)
    """
    if days_passed <= 0 or days_remaining <= 0:
        return 0.0

    # 1. Current month has enough data — trust it
    if n_days is not None and n_days >= 3 and days_passed > 0:
        daily_rate = spent_so_far / days_passed

    # 2. Sparse current data — fall back to historical average
    elif historical_daily_avg and historical_daily_avg > 0:
        daily_rate = historical_daily_avg

    # 3. Nothing to go on
    else:
        return 0.0

    return round(daily_rate * days_remaining, 2)
