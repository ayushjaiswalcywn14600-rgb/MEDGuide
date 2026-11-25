const ConsoleSmsProvider = require("./ConsoleSmsProvider");
const Msg91SmsProvider = require("./Msg91SmsProvider");
const TwilioSmsProvider = require("./TwilioSmsProvider");
const { env } = require("../../shared/env");

let smsProviderInstance = null;

function getSmsProvider() {
  if (smsProviderInstance) return smsProviderInstance;

  const providerType = env.SMS_PROVIDER || "console";

  switch (providerType.toLowerCase()) {
    case "msg91":
      smsProviderInstance = new Msg91SmsProvider();
      break;
    case "twilio":
      smsProviderInstance = new TwilioSmsProvider();
      break;
    case "console":
    default:
      smsProviderInstance = new ConsoleSmsProvider();
      break;
  }

  return smsProviderInstance;
}

module.exports = { getSmsProvider };
