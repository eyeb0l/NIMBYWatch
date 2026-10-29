CREATE TABLE IF NOT EXISTS housing_extractions (
 id text PRIMARY KEY,
 application_id text NOT NULL REFERENCES applications(id),
 description_hash text NOT NULL,
 model text NOT NULL,
 prompt_version text NOT NULL,
 status text NOT NULL CHECK(status IN ('processing','complete','failed')),
 result jsonb,
 reserved_cost_usd numeric(12,6) NOT NULL,
 estimated_cost_usd numeric(12,6),
 input_tokens integer,
 output_tokens integer,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(application_id,description_hash,model,prompt_version)
);
CREATE INDEX IF NOT EXISTS housing_extractions_application ON housing_extractions(application_id,status);
ALTER TABLE housing_extractions ENABLE ROW LEVEL SECURITY;
