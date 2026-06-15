from openhands.sdk.tool.registry import register_tool

from .ask_user import AskUserTool, current_run_ctx
from .web_search import WebSearchTool

# Make tools resolvable by name to any Agent in this process.
register_tool("web_search", WebSearchTool)
register_tool("ask_user", AskUserTool)

__all__ = ["WebSearchTool", "AskUserTool", "current_run_ctx"]
