---
name: printer-escpos
description: Use for printer SDK, ESC/POS formatting, print spool, drawer open, reprint.
---

# 80mm receipt & drawer print reliability

**Trigger:** Use for printer SDK, ESC/POS formatting, print spool, drawer open, reprint.

## Mandatory task instructions

1. Exactly one thermal printer, one receipt batch on fully paid settlement containing CUSTOMER+STORE copies; no kitchen tickets.
2. Separate receipt intent from physical device job/attempt. Printer ACK is not proof paper was physically cut; UNKNOWN needs operator inspect/reprint.
3. Test Vietnamese Unicode rendering via proper codepage/raster approach on purchased printer; receipts include same order ID, distinct copy header.
4. Failure injection: unplug, out of paper after first copy, reboot and duplicate callback. Reprint adds watermark and audit event, never second capture.
5. Drawer open must use cashier authorization and hardware-specific port verification; do not hardcode ESC/POS codes without SDK evidence.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
