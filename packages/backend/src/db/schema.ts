import {
  sqliteTable,
  text,
  integer,
} from 'drizzle-orm/sqlite-core';

export const deployments = sqliteTable('deployments', {
  id: text('id').primaryKey(),
  repoUrl: text('repo_url').notNull(),
  status: text('status').notNull().default('queued'),
  imageTag: text('image_tag'),
  containerId: text('container_id'),
  portMappings: text('port_mappings', { mode: 'json' }).default('[]'),
  errorMessage: text('error_message'),
  creatorIp: text('creator_ip').notNull(),
  sessionToken: text('session_token').notNull(),
  expiresAt: text('expires_at'),
  extensionCount: integer('extension_count').default(0),
  createdAt: text('created_at'),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  metadata: text('metadata', { mode: 'json' }),
});

export const deployLogs = sqliteTable('deploy_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deploymentId: text('deployment_id').notNull().references(() => deployments.id),
  message: text('message').notNull(),
  stream: text('stream').notNull().default('system'),
  stage: text('stage'),
  createdAt: text('created_at'),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deploymentId: text('deployment_id').references(() => deployments.id),
  action: text('action').notNull(),
  details: text('details', { mode: 'json' }),
  ipAddress: text('ip_address'),
  createdAt: text('created_at'),
});
