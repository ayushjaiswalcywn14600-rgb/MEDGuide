const http = require("http");
const https = require("https");
const { env } = require("./env");

class CircuitBreaker {
  constructor(failureThreshold = 3, resetTimeoutMs = 30000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.failureCount = 0;
    this.state = "CLOSED"; // CLOSED | OPEN | HALF_OPEN
    this.nextAttempt = Date.now();
  }

  isOpen() {
    if (this.state === "OPEN") {
      if (Date.now() > this.nextAttempt) {
        this.state = "HALF_OPEN";
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  recordFailure() {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.resetTimeoutMs;
      console.warn(
        `[CIRCUIT BREAKER] AI Service circuit opened for ${this.resetTimeoutMs}ms after ${this.failureCount} failures.`
      );
    }
  }
}

const aiBreaker = new CircuitBreaker();

/**
 * Invokes the AI service symptom-classification endpoint with safety guarantees:
 * 1. Fast timeout (3000ms max)
 * 2. Circuit breaker protection
 * 3. Graceful fallback to rule-based triage (never blocks or downgrades)
 */
async function getAiTriageSuggestion(answers, ruleResult) {
  // SAFETY: If rule result is RED, NEVER call the AI service. Short-circuit immediately.
  if (ruleResult.level === "RED") {
    return ruleResult;
  }

  if (aiBreaker.isOpen()) {
    return {
      ...ruleResult,
      fallbackUsed: true,
      note: "AI service circuit is currently open; safe rule-based verdict returned.",
    };
  }

  const url = `${env.AI_SERVICE_BASE_URL}/symptom-classification/suggest`;
  const postData = JSON.stringify(answers);

  try {
    const result = await makeHttpRequest(url, postData, 3000);
    aiBreaker.recordSuccess();
    return result;
  } catch (err) {
    aiBreaker.recordFailure();
    console.warn(
      `[AI-CLIENT] AI service call failed (${err.message}); falling back safely to rule verdict.`
    );
    return {
      ...ruleResult,
      fallbackUsed: true,
      note: "AI service unavailable; safe rule-based verdict preserved.",
    };
  }
}

function makeHttpRequest(targetUrl, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "X-API-Key": env.AI_SERVICE_API_KEY,
      },
      timeout: timeoutMs,
    };

    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Invalid JSON from AI service"));
          }
        } else {
          reject(new Error(`AI service returned HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`AI service request timed out after ${timeoutMs}ms`));
    });

    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

module.exports = {
  getAiTriageSuggestion,
  aiBreaker,
};
