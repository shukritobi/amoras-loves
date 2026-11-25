CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, chip_id TEXT UNIQUE, subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, total INTEGER NOT NULL, commission INTEGER NOT NULL, status TEXT NOT NULL, details TEXT NOT NULL, paid_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
-- Commission is an accounting entry only, and is payable after paid status and refund reconciliation.
