import sqlite3
import sys
from config import DB_PATH
from services.rag_service import RAGService

sys.stdout.reconfigure(encoding="utf-8")
conn_fn = lambda: sqlite3.connect(str(DB_PATH))
rag = RAGService(conn_fn)

tests = [
    ("Greeting", "Hi"),
    ("Greeting 2", "Hello Revora"),
    ("Math 1", "what is 2 + 2?"),
    ("Math 2", "Solve 45 * 89"),
    ("Unrelated Word with sticky context", "FISH"),
    ("Project Query", "Why did TX10988 fail?"),
    ("Policy Query", "What is the maximum retry limit?"),
]

for name, q in tests:
    res = rag.answer_query(q, session_context={"active_transaction_id": "TX10988"})
    print(f"=== {name} ({q}) ===")
    print("Intent:", res.get("intent"))
    print("Decision:", res.get("decision"))
    print("Answer:", res.get("answer"))
    print()
