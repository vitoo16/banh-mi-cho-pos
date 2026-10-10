# Suggested GitHub issue batches

Create issues only after publishing an empty private repository. Every issue includes links to MVP v1.2, relevant plan, acceptance ID, skills to load, blocking dependencies, and evidence required.

| Issue | Owner lane | Blocks |
|---|---|---|
| POC-01 Windows POS + LAN host | Architecture/QA | M1 scaffolding |
| POC-02 RN native Android/iOS LAN pairing | Mobile | RN production development |
| POC-03 printer two-copy/cutter/drawer proof | Backend/QA | BE-07 and hardware buy |
| POC-04 SQLite WAL/restart/outbox | Backend | BE-03/04 |
| POC-05 selected bank provider compatibility | Payment | BE-08 |
| POC-06 observe counter UX | Business/Web | final POS layout |
| C-01 pure VND domain and fixtures | BE+Architect | all payment tasks |
| C-02 OpenAPI v1 freeze | Architect+BE+FE | all clients and services |
| C-03 SQLite+Postgres migrations | Backend | persistence |
| C-04 generated SDK + MSW fixtures | FE+BE | FW/FM implementation |
| C-05 threat model + CI gate plan | Security/QA | implementation |
| BE-01..04 local order/auth/events | Backend | INT-01 |
| FW-01..02 Vite POS+owner catalog | Web | INT-01 |
| FM-01..02 RN staff order/capture | Mobile | INT-01 |
| INT-01 end-to-end order receipt ACK | Integration | M3 payment |
| BE-05..07 cash/shift/receipt queue | Backend | INT-02 |
| FW-03..04 cash/shift UI | Web | INT-02 |
| INT-02 cash sale+2 physical copies | Integration/QA | M4 |
| BE-08..10 bank/sync/report | Backend | INT-03 |
| FW-05..06 bank/owner view | Web | INT-03 |
| INT-03 bank verification/sync | Integration/QA | M5 |
| QA-01..03 security/offline/load | QA+Auditor | M6 |
| OPS-01..02 install/backup/monitor | Ops | M6 |
| PILOT-01 shadow operation and owner signature | Business/QA | go-live |
