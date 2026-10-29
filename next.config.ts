import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  outputFileTracingIncludes: { "/*": ["./migrations/*.sql", "./data/*.json"] },
};
export default config;
