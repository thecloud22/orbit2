import json, sys
try:
    path = json.load(sys.stdin).get("tool_input", {}).get("file_path", "") or ""
except Exception:
    sys.exit(0)

def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason}}))
    sys.exit(0)

if path.endswith(("orbit-2.0-functional-specification.md", "slice-1-brief.md")):
    deny("This file is the functional contract: it describes the destination, not the current "
         "state. Record progress in docs/ACTIVE_TASK.md. Change it only when the product "
         "requirement itself changes, and say so explicitly.")
if "/fixtures/published/" in path:
    deny("A published version is immutable. Publishing mints a new version; it never edits an "
         "existing one. Add a new fixture rather than changing this one.")
