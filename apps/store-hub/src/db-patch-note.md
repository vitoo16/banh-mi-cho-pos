# Required migration before run

The `orders` display code uses SQLite's dedicated monotonic AUTOINCREMENT counter.
Apply the `order_sequence` table in `src/db.ts` before first startup.
This is included in the source update accompanying this commit.
