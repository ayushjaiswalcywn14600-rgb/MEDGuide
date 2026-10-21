const { pool } = require("./db");

/**
 * Append-only audit trail. Required for:
 *  - doctor verification decisions
 *  - health record access / export / deletion
 *  - prescription creation / modification
 *  - SOS trigger / cancel
 *  - consent grant / withdrawal
 *
 * Rows are never updated or deleted by application code (enforce with a DB trigger
 * or REVOKE UPDATE/DELETE on this table for the app role in production).
 */
async function writeAuditLog({ actorId, actorRole, action, targetType, targetId, metadata = {} }) {
  const query = `
    INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `;
  const values = [actorId, actorRole, action, targetType, targetId, JSON.stringify(metadata)];

  try {
    await pool.query(query, values);
  } catch (err) {
    // Audit logging must never silently disappear — surface loudly even if the
    // triggering request still succeeds, so ops can alert on it.
    console.error("AUDIT LOG WRITE FAILED", { action, targetType, targetId, err: err.message });
  }
}

module.exports = { writeAuditLog };
