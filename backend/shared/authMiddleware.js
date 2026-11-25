const jwt = require("jsonwebtoken");
const { env } = require("./env");

/**
 * Verifies the JWT issued after OTP login and attaches { id, role, phone } to req.user.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  try {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      throw new Error("Server authentication misconfiguration: JWT_SECRET missing or too short");
    }
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    if (err.message && err.message.includes("Server authentication misconfiguration")) {
      console.error(err);
      return res.status(500).json({ error: "Server authentication misconfiguration" });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Restricts a route to specific roles, e.g. requireRole("doctor", "admin").
 * Roles: patient | doctor | clinic_admin | pharmacist | super_admin
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
