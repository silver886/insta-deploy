import type { Client } from '@libsql/client';

export async function initializeDatabase(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      repo_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      image_tag TEXT,
      container_id TEXT,
      port_mappings TEXT DEFAULT '[]',
      error_message TEXT,
      creator_ip TEXT NOT NULL,
      session_token TEXT NOT NULL,
      tunnel_protocol TEXT DEFAULT 'http',
      expires_at TEXT,
      extension_count INTEGER DEFAULT 0,
      created_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS deploy_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT NOT NULL REFERENCES deployments(id),
      message TEXT NOT NULL,
      stream TEXT NOT NULL DEFAULT 'system',
      stage TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT REFERENCES deployments(id),
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
    CREATE INDEX IF NOT EXISTS idx_deployments_creator_ip ON deployments(creator_ip);
    CREATE INDEX IF NOT EXISTS idx_deployments_expires_at ON deployments(expires_at);
    CREATE INDEX IF NOT EXISTS idx_deploy_logs_deployment_id ON deploy_logs(deployment_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_deployment_id ON audit_log(deployment_id);
  `);

  // Migrate existing tables — add columns if they don't exist
  const migrations = [
    "ALTER TABLE deploy_logs ADD COLUMN stage TEXT",
    "ALTER TABLE deployments ADD COLUMN tunnel_protocol TEXT DEFAULT 'http'",
  ];

  for (const migration of migrations) {
    try {
      await client.execute(migration);
    } catch {
      // Column already exists
    }
  }
}
