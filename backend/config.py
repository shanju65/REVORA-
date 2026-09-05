"""
Revora Configuration Module
Centralizes environment settings, database paths, and API credentials.
"""
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent

# Load local .env files gracefully if present
for potential_env in (BASE_DIR.parent / ".env", BASE_DIR / ".env"):
    if potential_env.exists():
        try:
            with open(potential_env, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

# Environment
ENVIRONMENT = os.getenv("REVORA_ENV", "development").lower()

# Database
DB_PATH = Path(os.getenv("REVORA_DB_PATH", BASE_DIR.parent / "data" / "revora.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Google Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Razorpay Test Credentials
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "rzp_test_TXQDZU5pahNQZS")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "teKOYDLqkaeXtoSVURRX9RCk")
RAZORPAY_MODE = os.getenv("RAZORPAY_MODE", "test").lower()

# CORS Allowed Origins
raw_cors = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
CORS_ORIGINS = [origin.strip() for origin in raw_cors.split(",") if origin.strip()]

# Deterministic Policy Invariants
MAX_RETRIES = 2
MAX_AUTO_ACTION_AMOUNT = 10000.0
MIN_RECOVERY_CONFIDENCE = 0.60
MAX_RECOVERY_WINDOW_MINUTES = 1440
