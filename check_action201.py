
import sys
from pathlib import Path
sys.path.append(str(Path.cwd() / "evcsms"))
try:
    from ocpp.v201.enums import Action as Action201
    print("Action201 members:")
    for m in dir(Action201):
        if not m.startswith("_"):
            print(f" - {m}")
except Exception as e:
    print(f"Error: {e}")
