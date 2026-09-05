import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

def post_chat(msg, active_tx=None):
    url = "http://localhost:8000/api/assistant/chat"
    payload = {
        "message": msg,
        "active_transaction_id": active_tx
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"error": str(e)}

print("=== Test 1: Greeting ('Hi') ===")
r1 = post_chat("Hi")
print("Full Response 1:", r1)

print("\n=== Test 2: Math Guardrail ('what is 2 + 2?') ===")
r2 = post_chat("what is 2 + 2?")
print("Decision:", r2.get("decision"))
print("Answer:", r2.get("answer"))

print("\n=== Test 3: Math Guardrail 2 ('Solve 45 * 89') ===")
r3 = post_chat("Solve 45 * 89")
print("Decision:", r3.get("decision"))
print("Answer:", r3.get("answer"))

print("\n=== Test 4: Unrelated text ('FISH') with active_tx TX10988 ===")
r4 = post_chat("FISH", active_tx="TX10988")
print("Decision:", r4.get("decision"))
print("Answer:", r4.get("answer"))

print("\n=== Test 5: In-Domain Query ('Why did TX10988 fail?') ===")
r5 = post_chat("Why did TX10988 fail?", active_tx="TX10988")
print("Decision:", r5.get("decision"))
print("Answer:", r5.get("answer"))
