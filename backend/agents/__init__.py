"""
ResearchOS agentic workflow runners.

Workflows:
  wf1 - Literature Reviewer: search arXiv, screen papers, propose curated collection.
  wf2 - Model Researcher: decompose ML task, find literature, suggest models.
  wf3 - Experiment Designer: generate experiment ideas with critique loop + code stubs.
"""

from agents.literature_reviewer import run_literature_reviewer
from agents.model_researcher import run_model_researcher
from agents.experiment_designer import run_experiment_designer

__all__ = [
    "run_literature_reviewer",
    "run_model_researcher",
    "run_experiment_designer",
]
