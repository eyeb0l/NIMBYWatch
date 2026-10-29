CREATE TABLE IF NOT EXISTS applications (
  id text PRIMARY KEY,
  reference text NOT NULL,
  authority text NOT NULL,
  registered_date date,
  status text NOT NULL CHECK (status IN ('approved','refused','withdrawn','pending','other')),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(authority, reference)
);
CREATE INDEX IF NOT EXISTS applications_registered_idx ON applications(registered_date DESC);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
