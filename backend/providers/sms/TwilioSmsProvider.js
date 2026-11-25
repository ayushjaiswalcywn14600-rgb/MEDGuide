const https = require("https");

class TwilioSmsProvider {
  constructor(config = {}) {
    this.name = "twilio";
    this.accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
    this.authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = config.fromNumber || process.env.TWILIO_FROM_NUMBER;
  }

  async sendOtp(phone, otp) {
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      throw new Error("Twilio credentials (ACCOUNT_SID, AUTH_TOKEN, FROM_NUMBER) not configured");
    }

    const postData = new URLSearchParams({
      To: phone.startsWith("+") ? phone : `+91${phone}`,
      From: this.fromNumber,
      Body: `Your MEDGUIDE verification code is ${otp}. Valid for 5 minutes. Do not share this with anyone.`,
    }).toString();

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    const options = {
      hostname: "api.twilio.com",
      path: `/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data);
              resolve({ success: true, messageId: parsed.sid });
            } catch {
              resolve({ success: true, messageId: "twilio_sent" });
            }
          } else {
            reject(new Error(`Twilio error (${res.statusCode}): ${data}`));
          }
        });
      });

      req.on("error", (err) => reject(err));
      req.write(postData);
      req.end();
    });
  }
}

module.exports = TwilioSmsProvider;
