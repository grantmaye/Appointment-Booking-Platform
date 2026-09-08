import type { Sql } from './database';
export async function migrate(db: Sql) {
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS workspaces(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS appointments(workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,id text NOT NULL,request_key text NOT NULL,request_payload text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,request_key))`,
    `CREATE TABLE IF NOT EXISTS occupied_slots(workspace_id text NOT NULL,provider_id text NOT NULL,starts_at timestamptz NOT NULL,appointment_id text NOT NULL,PRIMARY KEY(workspace_id,provider_id,starts_at),FOREIGN KEY(workspace_id,appointment_id) REFERENCES appointments(workspace_id,id) ON DELETE CASCADE)`,
  ])
    await db.query(sql);
}
