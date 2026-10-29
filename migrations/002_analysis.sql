CREATE TABLE IF NOT EXISTS analysis_budget (
  day date PRIMARY KEY,
  reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0)
);
CREATE TABLE IF NOT EXISTS document_analyses (
  id text PRIMARY KEY,
  application_id text NOT NULL REFERENCES applications(id),
  document_hash text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing','needs_review','published','failed')),
  metadata jsonb NOT NULL,
  source_text text NOT NULL,
  result jsonb,
  reserved_cost_usd numeric(12,6) NOT NULL,
  estimated_cost_usd numeric(12,6),
  input_tokens integer,
  output_tokens integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE(application_id, document_hash, model, prompt_version)
);
CREATE INDEX IF NOT EXISTS document_analyses_application_status ON document_analyses(application_id,status);
-- Direct public DB access is forbidden. Next server exposes only reviewed results.
ALTER TABLE document_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_budget ENABLE ROW LEVEL SECURITY;
