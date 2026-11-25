const https = require("https");

class Msg91SmsProvider {
  constructor(config = {}) {
    this.name = "msg91";
    this.authKey = config.authKey || process.env.MSG91_AUTH_KEY;
    this.templateId = config.templateId || process.env.MSG91_TEMPLATE_ID;
  }

  async sendOtp(phone, otp) {
    if (!this.authKey) {
      throw new Error("MSG91_AUTH_KEY not configured");
    }

    // Normalize phone number (strip leading + if present, ensure country code)
    const formattedPhone = phone.replace(/^\+/, "");
    const url = `https://control.msg91.com/api/v5/otp?template_id=${this.templateId || ""}&mobile=${formattedPhone}&authkey=${this.authKey}&otp=${otp}`;

    return new Promise((resolve, reject) => {
      const req = https.request(url, { method: "POST" }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, messageId: parsed.request_id || "msg91_ok" });
            } else {
              reject(new Error(`MSG91 error: ${parsed.message || data}`));
            }
          } catch (e) {
            resolve({ success: true, messageId: "msg91_raw_response" });
          }
        });
      });

      req.on("error", (err) => reject(err));
      req.end();
    });
  }
}

module.exports = Msg91SmsProvider;
