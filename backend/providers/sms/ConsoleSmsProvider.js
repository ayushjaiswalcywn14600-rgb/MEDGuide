class ConsoleSmsProvider {
  constructor() {
    this.name = "console";
  }

  async sendOtp(phone, otp) {
    // SECURITY RULE: OTP is logged ONLY when NODE_ENV === 'development'
    if (process.env.NODE_ENV === "development") {
      console.log(`[SMS-DEV] OTP for ${phone}: ${otp} (valid for 5 minutes)`);
    }
    return { success: true, messageId: `console_${Date.now()}` };
  }
}

module.exports = ConsoleSmsProvider;
