const { pool } = require("./db");

/**
 * Middleware that strictly enforces DPDP Act 2023 consent before accessing sensitive operations.
 * If user hasn't actively granted consent for the specific purpose, access is blocked with 403.
 *
 * @param {string} purpose e.g. 'symptom_analysis', 'history_based_recommendations'
 */
function requireConsent(purpose) {
  return async (req, res, next) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const result = await pool.query(
        `SELECT granted FROM consents
         WHERE user_id = $1 AND purpose = $2
         ORDER BY COALESCE(withdrawn_at, granted_at) DESC, id DESC
         LIMIT 1`,
        [req.user.id, purpose]
      );

      if (result.rows.length === 0 || !result.rows[0].granted) {
        return res.status(403).json({
          error: `Active consent required for purpose: '${purpose}' under DPDP Act 2023`,
          code: "CONSENT_REQUIRED",
          purpose,
          requiresConsent: true,
        });
      }

      return next();
    } catch (err) {
      console.error("Consent verification failed:", err);
      return res.status(500).json({ error: "Failed to verify required consent" });
    }
  };
}

module.exports = { requireConsent };
