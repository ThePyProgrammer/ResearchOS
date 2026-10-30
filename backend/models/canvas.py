"""JSON Canvas 1.0 validation; retain extension fields for lossless round trips."""
import json
import math
import re


def validate_canvas(content: str) -> str:
    try:
        value = json.loads(content)
    except (ValueError, TypeError) as exc:
        raise ValueError("Canvas content must be valid JSON") from exc
    if not isinstance(value, dict):
        raise ValueError("Canvas must be a JSON object")
    nodes, edges = value.get("nodes", []), value.get("edges", [])
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("Canvas nodes and edges must be arrays")
    ids = set()

    def text(item, key, required=False):
        if required or key in item:
            if not isinstance(item.get(key), str):
                raise ValueError(f"Canvas {key} must be a string")

    def identity(item):
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]:
            raise ValueError("Canvas elements require a nonempty string id")
        if item["id"] in ids:
            raise ValueError("Canvas element ids must be unique")
        ids.add(item["id"])
        if "color" in item and (not isinstance(item["color"], str) or not re.fullmatch(r"[1-6]|#[0-9a-fA-F]{6}", item["color"])):
            raise ValueError("Canvas color must be a preset 1–6 or #RRGGBB")

    for node in nodes:
        identity(node)
        if node.get("type") not in ("text", "file", "link", "group"):
            raise ValueError("Unknown canvas node type")
        for key in ("x", "y", "width", "height"):
            number = node.get(key)
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or number != int(number):
                raise ValueError(f"Canvas {key} must be a finite integer")
            if key in ("width", "height") and number <= 0:
                raise ValueError("Canvas dimensions must be positive")
        if node["type"] == "text":
            text(node, "text", True)
        elif node["type"] == "file":
            text(node, "file", True)
            text(node, "subpath")
            if "subpath" in node and not node["subpath"].startswith("#"):
                raise ValueError("Canvas subpath must start with #")
        elif node["type"] == "link":
            text(node, "url", True)
        else:
            text(node, "label")
            text(node, "background")
            if "backgroundStyle" in node and node["backgroundStyle"] not in ("cover", "ratio", "repeat"):
                raise ValueError("Invalid canvas background style")
    node_ids = set(ids)
    for edge in edges:
        identity(edge)
        for key in ("fromNode", "toNode"):
            text(edge, key, True)
            if edge[key] not in node_ids:
                raise ValueError("Canvas edges must reference existing nodes")
        for key in ("fromSide", "toSide"):
            if key in edge and edge[key] not in ("top", "right", "bottom", "left"):
                raise ValueError("Invalid canvas connection side")
        for key in ("fromEnd", "toEnd"):
            if key in edge and edge[key] not in ("none", "arrow"):
                raise ValueError("Invalid canvas connection endpoint")
        text(edge, "label")
    return content
