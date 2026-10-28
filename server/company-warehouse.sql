PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS companies (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, source_key TEXT NOT NULL,
 name TEXT NOT NULL, name_norm TEXT NOT NULL, country TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL, confidence TEXT NOT NULL DEFAULT 'normal', merged_into TEXT REFERENCES companies(id),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(source,source_key), CHECK(merged_into IS NULL OR merged_into<>id)
);
CREATE INDEX IF NOT EXISTS company_name_country ON companies(country,name_norm);
CREATE INDEX IF NOT EXISTS company_root ON companies(COALESCE(merged_into,id));
CREATE INDEX IF NOT EXISTS company_parent ON companies(merged_into);
CREATE INDEX IF NOT EXISTS company_list ON companies(merged_into,name,id);
CREATE TABLE IF NOT EXISTS company_facts (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), source TEXT NOT NULL,
 source_key TEXT NOT NULL, role TEXT NOT NULL, payload TEXT NOT NULL, content_hash TEXT NOT NULL,
 product TEXT NOT NULL DEFAULT '', hs TEXT NOT NULL DEFAULT '', trade_date TEXT NOT NULL DEFAULT '',
 first_imported_at INTEGER NOT NULL, imported_at INTEGER NOT NULL, last_run INTEGER NOT NULL,
 UNIQUE(source,source_key,role)
);
CREATE INDEX IF NOT EXISTS fact_company ON company_facts(company_id,source,trade_date);
CREATE INDEX IF NOT EXISTS fact_product ON company_facts(product,company_id);
CREATE TABLE IF NOT EXISTS company_contacts (
 fact_id TEXT NOT NULL REFERENCES company_facts(id), company_id TEXT NOT NULL REFERENCES companies(id),
 kind TEXT NOT NULL, value TEXT NOT NULL, normalized TEXT NOT NULL,
 PRIMARY KEY(fact_id,kind,normalized)
);
CREATE INDEX IF NOT EXISTS contact_company ON company_contacts(company_id,kind);
CREATE INDEX IF NOT EXISTS contact_value ON company_contacts(kind,normalized,company_id);
CREATE TABLE IF NOT EXISTS company_candidates (
 id INTEGER PRIMARY KEY, left_id TEXT NOT NULL REFERENCES companies(id), right_id TEXT NOT NULL REFERENCES companies(id),
 signals TEXT NOT NULL, revision TEXT NOT NULL, evidence_changed INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 UNIQUE(left_id,right_id), CHECK(left_id<right_id)
);
CREATE INDEX IF NOT EXISTS candidate_status ON company_candidates(status);
CREATE TABLE IF NOT EXISTS company_reviews (
 id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES company_candidates(id),
 action TEXT NOT NULL, actor INTEGER NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS company_sync_runs (
 id INTEGER PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER, status TEXT NOT NULL,
 counts TEXT NOT NULL DEFAULT '{}', error TEXT
);
