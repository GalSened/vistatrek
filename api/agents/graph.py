"""LangGraph definition for the trip report generation pipeline."""

import logging
from typing import Literal

from langgraph.graph import StateGraph, START, END

from .state import TripReportState
from .research import research_agent
from .validation import validation_agent
from .html_generator import html_generator_agent

logger = logging.getLogger(__name__)


def should_retry_or_generate(state: TripReportState) -> Literal["generate", "research"]:
    """
    Decide next step based on validation status.

    Returns:
        "generate" - Proceed to HTML generation
        "research" - Retry research (if attempts < 3 and status is invalid)
    """
    validation_status = state.get("validation_status", "invalid")
    research_attempts = state.get("research_attempts", 0)

    logger.info(
        f"Routing decision: status={validation_status}, attempts={research_attempts}"
    )

    if validation_status == "valid":
        # All stops validated, proceed to generation
        return "generate"

    if validation_status == "partial":
        # 80%+ valid, good enough to proceed
        logger.info("Partial validation - proceeding with valid stops")
        return "generate"

    # Status is "invalid" or "pending"
    if research_attempts < 3:
        # Retry research
        logger.info(f"Invalid status, retrying research (attempt {research_attempts + 1})")
        return "research"

    # Max retries reached, proceed with whatever we have
    logger.warning("Max research attempts reached, proceeding anyway")
    return "generate"


def build_report_graph() -> StateGraph:
    """
    Build the LangGraph StateGraph for report generation.

    Pipeline flow:
        START → research → validate → [conditional] → generate → END
                   ↑                        |
                   └────── retry ───────────┘
    """
    builder = StateGraph(TripReportState)

    # Add nodes (agents)
    builder.add_node("research", research_agent)
    builder.add_node("validate", validation_agent)
    builder.add_node("generate", html_generator_agent)

    # Define edges
    builder.add_edge(START, "research")
    builder.add_edge("research", "validate")

    # Conditional edge from validate: either generate or retry research
    builder.add_conditional_edges(
        "validate",
        should_retry_or_generate,
        {
            "generate": "generate",
            "research": "research",
        },
    )

    builder.add_edge("generate", END)

    # Compile the graph
    return builder.compile()


# Singleton graph instance for reuse
report_graph = build_report_graph()
