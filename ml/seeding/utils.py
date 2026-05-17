"""
Shared utilities for SpendWise data seeding modules.
"""

import os
import uuid as _uuid

import yaml


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


def load_lines(path):
    with open(path) as f:
        return [line.strip() for line in f if line.strip()]


def uuid4():
    return str(_uuid.uuid4())


def weighted_choice(options, weights):
    """Pick one option by weight. options: list, weights: list of numbers."""
    import random
    total = sum(weights)
    r = random.random() * total
    cumulative = 0
    for opt, w in zip(options, weights):
        cumulative += w
        if r <= cumulative:
            return opt
    return options[-1]


def weighted_choices(options, weights, k=1):
    """Pick k options with replacement by weight."""
    return [weighted_choice(options, weights) for _ in range(k)]


def clamp(val, lo, hi):
    return max(lo, min(hi, val))
