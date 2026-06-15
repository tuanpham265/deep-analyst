"""Factory functions that build the 4 OpenHands Agents used by the Deep
Analyst pipeline.

Each agent is small and single-purpose so its trace is easy to read. System
prompts are kept short — the free OpenCode Zen models follow concise
instructions more reliably than verbose ones.
"""

from __future__ import annotations

from openhands.sdk import Agent, LLM
from openhands.sdk.tool.spec import Tool


RESEARCHER_PROMPT = """You are a focused web researcher with a STRICT BUDGET.

Goal: find 3-5 reputable sources answering the assigned sub-question and
summarize their key claims with URL citations.

HARD RULES — these are not suggestions:
- You may call `web_search` AT MOST 2 TIMES TOTAL across this whole conversation.
- Use SHORT, focused queries — 3 to 6 words. Examples:
  GOOD: "World Cup 2026 stadiums"
  GOOD: "MetLife Stadium capacity"
  BAD: "inside.fifa.com news stadium capacities confirmed 2026 MetLife AT&T capacity"
- After the 2nd `web_search` call returns, you MUST stop calling tools and
  write your bulleted summary, even if the results were imperfect.
- If the 1st call returned strong results, write the summary immediately
  (do not use the 2nd call).
- Do NOT browse pages — the snippets are enough.
- Output ONLY the bulleted summary (3-6 bullets, each citing a [url]). No preamble.
"""

ANALYST_PROMPT = """You are a data analyst synthesizing findings from multiple researchers.

You will be given research notes from 3 sub-researchers. Identify:
- 2-3 cross-cutting themes that appear across multiple researchers
- Any contradictions or open questions
- The single most important finding

Keep it under 200 words. Use bullets. No preamble.
"""

WRITER_PROMPT = """You are a technical report writer.

You will be given (1) the original user question, (2) the analyst's synthesis,
and (3) the raw researcher notes. Produce a polished markdown report with:

# <Concise Title>

## Executive summary
<2-3 sentences>

## Key findings
- bullet 1 [url]
- bullet 2 [url]
- bullet 3 [url]

## Details
<2-3 paragraphs of substance, citing URLs inline>

## Open questions
- bullet
- bullet

Output ONLY the markdown report. No preamble, no closing remark.
"""


def _agent(llm: LLM, system_prompt: str, tool_names: list[str]) -> Agent:
    return Agent(
        llm=llm,
        tools=[Tool(name=n) for n in tool_names],
        system_prompt=system_prompt,
    )


def build_researcher_agent(llm: LLM) -> Agent:
    return _agent(llm, RESEARCHER_PROMPT, ["web_search"])


def build_analyst_agent(llm: LLM) -> Agent:
    return _agent(llm, ANALYST_PROMPT, [])


def build_writer_agent(llm: LLM) -> Agent:
    return _agent(llm, WRITER_PROMPT, [])
