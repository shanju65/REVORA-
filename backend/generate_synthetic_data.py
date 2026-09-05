"""Reset and regenerate Revora's reproducible 10,000-event dataset."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from main import DB_PATH, initialise  # noqa: E402

if DB_PATH.exists():
    DB_PATH.unlink()
initialise()
print(f"Generated 10,000 synthetic events at {DB_PATH}")
