"""Web search tool for OpenHands.

Backend cascade (first non-empty wins):
1. **Serper.dev** (real Google results) — used when `SERPER_API_KEY` is set.
2. **Wikipedia** (`action=query&list=search`) — stable, free, no auth.
3. **DuckDuckGo HTML** scrape — last resort; rate-limits aggressively.

The agent doesn't need to know which backend served the query — all return
a markdown-formatted list of {title, url, snippet}.
"""

from __future__ import annotations

import html
import os
import re
from collections.abc import Sequence
from typing import TYPE_CHECKING, Self
from urllib.parse import quote

import httpx
from pydantic import Field

from openhands.sdk.llm.message import TextContent
from openhands.sdk.tool.tool import (
    Action,
    Observation,
    ToolAnnotations,
    ToolDefinition,
    ToolExecutor,
)

if TYPE_CHECKING:
    from openhands.sdk.conversation.state import ConversationState


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_DDG_RESULT_LINK_RE = re.compile(
    r'<a [^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.DOTALL
)
_DDG_RESULT_SNIPPET_RE = re.compile(
    r'<a [^>]*class="result__snippet"[^>]*>(.*?)</a>', re.DOTALL
)

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 "
    "DeepAnalystCapstone/0.1 (capstone evaluation)"
)


def _strip_html(s: str) -> str:
    return html.unescape(_HTML_TAG_RE.sub("", s)).strip()


def _serper_search(query: str, max_results: int = 5, timeout: float = 10.0) -> list[dict]:
    """Real Google results via Serper.dev. Returns [] if no API key configured."""
    key = os.environ.get("SERPER_API_KEY", "").strip()
    if not key:
        return []
    r = httpx.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": key, "Content-Type": "application/json"},
        json={"q": query, "num": max_results},
        timeout=timeout,
    )
    r.raise_for_status()
    payload = r.json()
    out: list[dict] = []
    for h in (payload.get("organic") or [])[:max_results]:
        out.append(
            {
                "title": h.get("title", "").strip(),
                "url": h.get("link", "").strip(),
                "snippet": (h.get("snippet") or "").strip(),
            }
        )
    return out


def _wikipedia_search(query: str, max_results: int = 5, timeout: float = 10.0) -> list[dict]:
    """Wikipedia full-text search via MediaWiki API."""
    r = httpx.get(
        "https://en.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "list": "search",
            "srsearch": query,
            "format": "json",
            "srlimit": max_results,
            "srprop": "snippet",
        },
        headers={"User-Agent": _USER_AGENT, "Accept-Language": "en"},
        timeout=timeout,
    )
    r.raise_for_status()
    payload = r.json()
    hits: list[dict] = []
    for h in payload.get("query", {}).get("search", []):
        title = h.get("title", "")
        snippet = _strip_html(h.get("snippet", ""))
        url = f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}"
        hits.append({"title": title, "url": url, "snippet": snippet})
    return hits


def _ddg_search(query: str, max_results: int = 5, timeout: float = 10.0) -> list[dict]:
    """DuckDuckGo HTML fallback. May return [] if DDG throttles or layout shifts."""
    try:
        resp = httpx.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={"User-Agent": _USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
            timeout=timeout,
            follow_redirects=True,
        )
    except Exception:
        return []
    if resp.status_code != 200:
        return []
    text = resp.text
    links = _DDG_RESULT_LINK_RE.findall(text)
    snippets = _DDG_RESULT_SNIPPET_RE.findall(text)
    out: list[dict] = []
    for i, (url_raw, title_raw) in enumerate(links):
        snippet_raw = snippets[i] if i < len(snippets) else ""
        out.append(
            {
                "url": _strip_html(url_raw),
                "title": _strip_html(title_raw),
                "snippet": _strip_html(snippet_raw),
            }
        )
        if len(out) >= max_results:
            break
    return out


def _search(query: str, max_results: int = 5) -> tuple[list[dict], str]:
    """Try Serper (Google) → Wikipedia → DuckDuckGo. Returns (hits, backend)."""
    try:
        google = _serper_search(query, max_results=max_results)
    except Exception:
        google = []
    if google:
        return google, "google (serper)"
    try:
        wiki = _wikipedia_search(query, max_results=max_results)
    except Exception:
        wiki = []
    if wiki:
        return wiki, "wikipedia"
    ddg = _ddg_search(query, max_results=max_results)
    return ddg, "duckduckgo"


class WebSearchAction(Action):
    """Search the web for information about a topic."""

    # `query` is logically required, but we accept an empty default so a model
    # that forgets the argument gets a recoverable observation back ("provide a
    # query") instead of a Pydantic validation error that wastes an iteration.
    query: str = Field(default="", description="REQUIRED. The search query (3-6 words).")
    max_results: int = Field(default=5, description="Max results to return (1-10).")


class WebSearchObservation(Observation):
    """Result of a web search — a markdown-formatted list of hits."""

    pass


WEB_SEARCH_DESCRIPTION = """Search the web (Google via Serper, falling back to
Wikipedia and DuckDuckGo) for current information about a topic. Returns the
top result titles, URLs, and snippets in markdown format. Cite URLs in your
final answer.

Use short, focused queries (3-6 words). Examples:
- web_search(query="World Cup 2026 stadiums")
- web_search(query="Python asyncio gotchas")
- web_search(query="MetLife Stadium capacity")
"""


class WebSearchExecutor(ToolExecutor):
    def __call__(
        self,
        action: WebSearchAction,
        conversation=None,  # noqa: ARG002
    ) -> WebSearchObservation:
        query = (action.query or "").strip()
        if not query:
            return WebSearchObservation(
                content=[
                    TextContent(
                        text=(
                            "web_search needs a non-empty `query` argument. "
                            "Example: web_search(query='World Cup 2026 stadiums'). "
                            "Try again with a 3-6 word query."
                        )
                    )
                ],
                is_error=True,
            )
        max_results = max(1, min(action.max_results, 10))
        try:
            hits, backend = _search(query, max_results=max_results)
        except Exception as e:
            return WebSearchObservation(
                content=[TextContent(text=f"web_search failed: {e}")],
                is_error=True,
            )

        if not hits:
            return WebSearchObservation(
                content=[TextContent(text=f"No results found for: {query}")]
            )

        lines = [f"Search results for: {query}  (source: {backend})", ""]
        for i, h in enumerate(hits, 1):
            lines.append(f"{i}. **{h['title']}**")
            lines.append(f"   {h['url']}")
            lines.append(f"   {h['snippet']}")
            lines.append("")
        return WebSearchObservation(content=[TextContent(text="\n".join(lines))])


class WebSearchTool(ToolDefinition[WebSearchAction, WebSearchObservation]):
    """Web search via Wikipedia (primary) + DuckDuckGo (fallback)."""

    @classmethod
    def create(
        cls,
        conv_state: "ConversationState | None" = None,  # noqa: ARG003
        **params,
    ) -> Sequence[Self]:
        if params:
            raise ValueError("WebSearchTool doesn't accept parameters")
        return [
            cls(
                description=WEB_SEARCH_DESCRIPTION,
                action_type=WebSearchAction,
                observation_type=WebSearchObservation,
                executor=WebSearchExecutor(),
                annotations=ToolAnnotations(
                    readOnlyHint=True,
                    destructiveHint=False,
                    idempotentHint=False,
                    openWorldHint=True,
                ),
            )
        ]
