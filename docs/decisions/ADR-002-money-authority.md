# ADR-002 — Money, receipts & offline authority (ACCEPTED)

1. `requested_payment_method` on order is an intent only; `captured payments` are separate immutable records. No automatic paid status from staff selection.
2. `order.status` is COMMITTED or VOIDED, with independent aggregate `payment_status` (UNPAID, PARTIAL, PAID, REFUNDED/partial) derived from ledger, never manually toggled.
3. All VND amounts positive integer minor unit VND, validated and overflow protected. Backend computes totals from immutable snapshots.
4. Settlement ledger writes atomically with paid event and receipt *intent*; **paper cannot be exactly-once guaranteed**. Preserve UNKNOWN printer states + signed reprint audit, never create a second sale.
5. Local hub cash is authoritative. Cloud can settle bank only from validated provider evidence. Offline bank cannot be auto-confirmed.
6. Close-shift expected = opening_float + sum(cash_in) - sum(cash_out). Reconcile against counted denomination total, variance signed and attributed, lock closed shift, corrections use adjustments/approval.
7. Mixed payments behind feature flag. Captures must never over-allocate order; transfers in excess become unmatched/suspense liability and exception, not sales.
8. Refund/void of settled payments creates compensating movements. Immutable receipts/print history remain accessible for audit.
9. Receipt batch created when (captured >= amount owed) for confirmed full settlement; exactly two receipt COPY entities: CUSTOMER, STORE. A replacement print has `REPRINT` watermark.
