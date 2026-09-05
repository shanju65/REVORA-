import urllib.request
import urllib.error
import json
from config import GEMINI_API_KEY

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"
payload = {"contents": [{"parts": [{"text": "Hello"}]}]}
req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req) as resp:
        print("Success:", resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print("HTTP Code:", e.code)
    print("Error Body:", e.read().decode("utf-8"))
except Exception as ex:
    print("Other error:", ex)
