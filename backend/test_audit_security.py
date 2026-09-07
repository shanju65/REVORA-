"""
Unit and Integration Tests for Audit Trail SHA-256 Cryptographic Integrity Hashing.
Verifies tamper-evident properties, canonical JSON encoding, hash chaining,
sensitive data exclusion, backfill/migration safety, and verification failures on tampering.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from services.audit_service import AuditService
from services.security_service import (
    GENESIS_PREVIOUS_HASH,
    backfill_audit_chain,
    canonical_json,
    compute_event_hash,
    compute_sha256,
    sanitize_for_audit,
    verify_audit_chain,
)


def create_test_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            transaction_id TEXT,
            event_type TEXT,
            actor TEXT,
            description TEXT,
            metadata TEXT,
            batch_id INTEGER DEFAULT NULL,
            case_id INTEGER DEFAULT NULL,
            event_hash TEXT DEFAULT NULL,
            previous_event_hash TEXT DEFAULT NULL
        );
    """)
    return conn


class TestAuditSecurity(unittest.TestCase):
    def setUp(self):
        self.audit = AuditService()

    # 1. Deterministic hashing: same input produces identical SHA-256 hash
    def test_deterministic_hashing_same_input(self):
        payload_a = {"event_type": "TEST_EVENT", "amount": 1000, "meta": {"rule": "A"}}
        payload_b = {"meta": {"rule": "A"}, "amount": 1000, "event_type": "TEST_EVENT"}
        hash_a = compute_sha256(payload_a)
        hash_b = compute_sha256(payload_b)
        self.assertEqual(hash_a, hash_b)
        self.assertEqual(len(hash_a), 64)

    # 2. Collision / sensitivity: different input produces different hash
    def test_different_input_produces_different_hash(self):
        hash_1 = compute_sha256({"event_type": "EVENT_A"})
        hash_2 = compute_sha256({"event_type": "EVENT_B"})
        self.assertNotEqual(hash_1, hash_2)

    # 3. Sensitive data exclusion: CVV, OTP, PIN, Card Numbers, Passwords, Secrets are scrubbed
    def test_sensitive_credentials_scrubbed_before_hashing(self):
        sensitive_data = {
            "transaction_id": "TX999",
            "cvv": "123",
            "otp": "654321",
            "pin": "0000",
            "card_number": "4111222233334444",
            "password": "secret_password",
            "api_key": "live_secret_key_12345",
            "normal_field": "SAFE_VALUE",
            "nested": {
                "cvv2": "999",
                "nested_safe": "SAFE_NESTED",
            },
        }
        sanitized = sanitize_for_audit(sensitive_data)
        self.assertNotIn("cvv", sanitized)
        self.assertNotIn("otp", sanitized)
        self.assertNotIn("pin", sanitized)
        self.assertNotIn("card_number", sanitized)
        self.assertNotIn("password", sanitized)
        self.assertNotIn("api_key", sanitized)
        self.assertNotIn("cvv2", sanitized["nested"])
        self.assertEqual(sanitized["normal_field"], "SAFE_VALUE")
        self.assertEqual(sanitized["nested"]["nested_safe"], "SAFE_NESTED")

        # Canonical string also strictly omits sensitive fields
        canonical = canonical_json(sanitized)
        self.assertNotIn("123", canonical)
        self.assertNotIn("654321", canonical)
        self.assertNotIn("4111222233334444", canonical)
        self.assertNotIn("secret_password", canonical)

    # 4. Valid audit chain passes verification
    def test_valid_audit_chain_passes_verification(self):
        conn = create_test_db()
        h1 = self.audit.record(conn, "TX001", "PAYMENT_FAILED", "GATEWAY", "Gateway timeout", {"gateway": "HDFC"})
        h2 = self.audit.record(conn, "TX001", "ROOT_CAUSE_IDENTIFIED", "ROOT_CAUSE_ANALYZER", "Diagnosed timeout")
        h3 = self.audit.record(conn, "TX001", "ACTION_APPROVED", "GUARDRAIL_ENGINE", "Auto retry approved")

        conn.commit()

        # Check DB state
        rows = conn.execute("SELECT id, event_hash, previous_event_hash FROM audit_logs ORDER BY id ASC").fetchall()
        self.assertEqual(len(rows), 3)
        self.assertIsNone(rows[0]["previous_event_hash"])
        self.assertEqual(rows[1]["previous_event_hash"], rows[0]["event_hash"])
        self.assertEqual(rows[2]["previous_event_hash"], rows[1]["event_hash"])

        # Verification result
        res = verify_audit_chain(conn)
        self.assertTrue(res["valid"])
        self.assertEqual(res["events_checked"], 3)
        self.assertIsNone(res["first_invalid_event"])
        conn.close()

    # 5. Modifying an audit record causes verification to fail (tamper detection)
    def test_modifying_audit_record_fails_verification(self):
        conn = create_test_db()
        self.audit.record(conn, "TX001", "PAYMENT_FAILED", "GATEWAY", "Initial failure")
        self.audit.record(conn, "TX001", "AI_ANALYSIS", "AI_AGENT", "Diagnosed failure")
        self.audit.record(conn, "TX001", "EXECUTION", "EXECUTOR", "Recovered capital")
        conn.commit()

        # Tamper with the 2nd record: modify description directly in DB
        conn.execute("UPDATE audit_logs SET description = 'TAMPERED DESCRIPTION' WHERE id = 2")
        conn.commit()

        res = verify_audit_chain(conn)
        self.assertFalse(res["valid"])
        self.assertEqual(res["first_invalid_event"], 2)
        self.assertEqual(res["reason"], "HASH_MISMATCH")
        conn.close()

    # 6. Breaking previous_event_hash causes verification to fail (chain breakage)
    def test_breaking_previous_event_hash_fails_verification(self):
        conn = create_test_db()
        self.audit.record(conn, "TX001", "PAYMENT_FAILED", "GATEWAY", "Initial failure")
        self.audit.record(conn, "TX001", "AI_ANALYSIS", "AI_AGENT", "Diagnosed failure")
        self.audit.record(conn, "TX001", "EXECUTION", "EXECUTOR", "Recovered capital")
        conn.commit()

        # Break parent hash link on 3rd record
        conn.execute("UPDATE audit_logs SET previous_event_hash = 'tampered_fake_parent_hash' WHERE id = 3")
        conn.commit()

        res = verify_audit_chain(conn)
        self.assertFalse(res["valid"])
        self.assertEqual(res["first_invalid_event"], 3)
        self.assertEqual(res["reason"], "CHAIN_BROKEN")
        conn.close()

    # 7. Empty audit trail behaves safely
    def test_empty_audit_trail_behaves_safely(self):
        conn = create_test_db()
        res = verify_audit_chain(conn)
        self.assertTrue(res["valid"])
        self.assertEqual(res["events_checked"], 0)
        self.assertIsNone(res["first_invalid_event"])
        conn.close()

    # 8. Legacy migration and backfill strategy
    def test_legacy_unhashed_audit_records_backfilled_safely(self):
        conn = create_test_db()
        # Simulate 5 legacy audit records created without event_hash or previous_event_hash
        for i in range(5):
            conn.execute(
                "INSERT INTO audit_logs (timestamp, transaction_id, event_type, actor, description, metadata) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    f"2026-09-01T10:0{i}:00Z",
                    f"TX_LEGACY_{i}",
                    "LEGACY_EVENT",
                    "SYSTEM",
                    f"Legacy description {i}",
                    json.dumps({"legacy_idx": i}),
                ),
            )
        conn.commit()

        # Before backfill: verify detects unhashed events
        res_before = verify_audit_chain(conn)
        self.assertFalse(res_before["valid"])
        self.assertEqual(res_before["reason"], "UNHASHED_EVENT")

        # Run safe backfill migration
        backfilled_count = backfill_audit_chain(conn)
        self.assertEqual(backfilled_count, 5)

        # After backfill: chain is cryptographically intact and verified
        res_after = verify_audit_chain(conn)
        self.assertTrue(res_after["valid"])
        self.assertEqual(res_after["events_checked"], 5)
        self.assertIsNone(res_after["first_invalid_event"])

        # Add new event after backfill: links seamlessly to the backfilled chain
        self.audit.record(conn, "TX_NEW_1", "NEW_POST_MIGRATION", "AI_AGENT", "New event after migration")
        conn.commit()

        res_new = verify_audit_chain(conn)
        self.assertTrue(res_new["valid"])
        self.assertEqual(res_new["events_checked"], 6)
        conn.close()

    # 9. Audit integrity endpoint response verification
    def test_audit_integrity_endpoint(self):
        from main import audit_integrity
        res = audit_integrity()
        self.assertIn("valid", res)
        self.assertTrue(res["valid"])
        self.assertIn("events_checked", res)
        self.assertGreaterEqual(res["events_checked"], 0)
        self.assertEqual(res.get("algorithm"), "SHA-256")


if __name__ == "__main__":
    unittest.main()
