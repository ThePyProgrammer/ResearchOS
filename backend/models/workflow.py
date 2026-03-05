from .base import CamelModel


class Workflow(CamelModel):
    id: str
    name: str
    description: str
    icon: str
    icon_color: str
    icon_bg: str
    status: str  # stable, beta, experimental
    steps: list[str]
    tools: list[str]
    tool_colors: list[str]
    estimated_time: str
    can_run_directly: bool
