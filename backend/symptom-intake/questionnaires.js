/**
 * MEDGUIDE Multilingual Symptom Questionnaires (English & Hindi)
 * Covers all 11 conditions supported by the triage rule engine.
 * Marked with [NEEDS CLINICAL REVIEW] for medical protocols in production.
 */

const QUESTIONNAIRES = {
  fever: {
    condition: "fever",
    title: { en: "Fever / Bukhar", hi: "बुखार" },
    description: {
      en: "High body temperature, chills, sweating, or body ache.",
      hi: "शरीर का तापमान बढ़ना, कंपकंपी, पसीना आना या शरीर में दर्द।",
    },
    questions: [
      {
        id: "temperatureC",
        type: "number",
        label: { en: "Recorded temperature (°C or °F)", hi: "मापा गया तापमान (°C या °F)" },
        placeholder: "e.g. 38.5 C or 101.3 F",
        required: false,
      },
      {
        id: "durationDays",
        type: "number",
        label: { en: "How many days have you had a fever?", hi: "आपको बुखार कितने दिनों से है?" },
        min: 0,
        max: 60,
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: {
          en: "Severity of discomfort (1 = mild, 10 = extreme)",
          hi: "तकलीफ की गंभीरता (1 = हल्का, 10 = अत्यधिक)",
        },
        min: 1,
        max: 10,
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: {
          en: "Do you have any of these concerning symptoms?",
          hi: "क्या आपको इनमें से कोई गंभीर लक्षण है?",
        },
        options: [
          {
            value: "breathing_difficulty",
            label: {
              en: "Difficulty breathing or fast breathing",
              hi: "सांस लेने में कठिनाई या तेज सांस",
            },
            isRedFlag: true,
          },
          {
            value: "stiff_neck",
            label: { en: "Stiff neck (unable to touch chin to chest)", hi: "गर्दन में अकड़न" },
            isRedFlag: true,
          },
          {
            value: "confusion",
            label: {
              en: "Confusion, drowsiness, or unresponsiveness",
              hi: "भ्रम, अत्यधिक सुस्ती या बेहोशी",
            },
            isRedFlag: true,
          },
          {
            value: "seizure",
            label: { en: "Seizure, fit, or convulsions", hi: "दौरा या झटके आना" },
            isRedFlag: true,
          },
          {
            value: "non_blanching_rash",
            label: {
              en: "Dark red/purple rash that does not fade when pressed",
              hi: "गहरे लाल या बैंगनी चकत्ते जो दबाने पर हल्के नहीं पड़ते",
            },
            isRedFlag: true,
          },
          { value: "chills", label: { en: "Chills or shivering", hi: "कंपकंपी" } },
          {
            value: "body_ache",
            label: { en: "General body ache or joint pain", hi: "बदन दर्द या जोड़ों में दर्द" },
          },
        ],
      },
    ],
  },

  headache: {
    condition: "headache",
    title: { en: "Headache / Sir Dard", hi: "सिर दर्द" },
    description: {
      en: "Pain or pressure in head, temples, or neck.",
      hi: "सिर, कनपटी या गर्दन में दर्द या दबाव।",
    },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "How many days has the headache lasted?", hi: "सिरदर्द कितने दिनों से है?" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Pain severity (1 to 10)", hi: "दर्द की तीव्रता (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Check if any apply:", hi: "यदि इनमें से कुछ है तो चुनें:" },
        options: [
          {
            value: "worst_headache_of_life",
            label: {
              en: "Sudden, worst headache of your life (thunderclap)",
              hi: "अचानक बहुत तेज सिरदर्द, जैसा पहले कभी न हुआ हो",
            },
            isRedFlag: true,
          },
          {
            value: "stroke_symptoms",
            label: {
              en: "Face drooping, arm weakness, or slurred speech",
              hi: "चेहरे का लटकना, कमजोरी, या बोलने में लड़खड़ाहट",
            },
            isRedFlag: true,
          },
          {
            value: "stiff_neck",
            label: { en: "Stiff neck with fever", hi: "बुखार के साथ गर्दन में अकड़न" },
            isRedFlag: true,
          },
          {
            value: "vision_loss",
            label: {
              en: "Sudden vision loss or double vision",
              hi: "अचानक आंखों की रोशनी कम होना या धुंधला दिखना",
            },
            isRedFlag: true,
          },
          {
            value: "head_injury_before_onset",
            label: {
              en: "Headache started immediately after a head injury",
              hi: "सिर पर चोट लगने के तुरंत बाद शुरू हुआ दर्द",
            },
            isRedFlag: true,
          },
          {
            value: "sensitivity_to_light",
            label: { en: "Sensitivity to light or sound", hi: "रोशनी या आवाज से परेशानी" },
          },
        ],
      },
    ],
  },

  cough_cold: {
    condition: "cough_cold",
    title: { en: "Cough & Cold / Khansi-Zukam", hi: "खांसी और जुकाम" },
    description: {
      en: "Runny/blocked nose, sore throat, or persistent cough.",
      hi: "नाक बहना/बंद होना, गले में खराश या लगातार खांसी।",
    },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Duration in days", hi: "दिनों की संख्या" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Severity (1 to 10)", hi: "गंभीरता (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Critical flags:", hi: "गंभीर लक्षण:" },
        options: [
          {
            value: "breathing_difficulty",
            label: {
              en: "Gasping, breathlessness, or struggling to breathe",
              hi: "सांस फूलना या सांस लेने में भारीपन",
            },
            isRedFlag: true,
          },
          {
            value: "coughing_blood",
            label: { en: "Coughing up blood or rust-colored phlegm", hi: "खांसी में खून आना" },
            isRedFlag: true,
          },
          {
            value: "chest_pain",
            label: {
              en: "Persistent pain or heaviness in chest",
              hi: "सीने में लगातार दर्द या भारीपन",
            },
            isRedFlag: true,
          },
          {
            value: "blue_lips_or_face",
            label: {
              en: "Bluish tint around lips or fingernails",
              hi: "होंठों या नाखूनों का नीला पड़ना",
            },
            isRedFlag: true,
          },
          {
            value: "sore_throat",
            label: {
              en: "Sore throat or pain while swallowing",
              hi: "गले में खराश या निगलने में दर्द",
            },
          },
        ],
      },
    ],
  },

  stomach_pain: {
    condition: "stomach_pain",
    title: { en: "Stomach Pain / Pet Dard", hi: "पेट दर्द" },
    description: {
      en: "Abdominal cramps, sharp pain, or bloating.",
      hi: "पेट में मरोड़, तेज दर्द या भारीपन।",
    },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Duration in days", hi: "दिनों की संख्या" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Pain severity (1 to 10)", hi: "दर्द की तीव्रता (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Check for red flags:", hi: "आपातकालीन लक्षण:" },
        options: [
          {
            value: "rigid_abdomen",
            label: {
              en: "Stomach is hard as a board / rigid",
              hi: "पेट छूने पर बिल्कुल सख्त होना",
            },
            isRedFlag: true,
          },
          {
            value: "vomiting_blood",
            label: { en: "Vomiting blood or coffee-ground material", hi: "उल्टी में खून आना" },
            isRedFlag: true,
          },
          {
            value: "black_tarry_stool",
            label: { en: "Black or tarry stools", hi: "काले रंग का मल आना" },
            isRedFlag: true,
          },
          {
            value: "severe_bleeding",
            label: { en: "Severe rectal or vaginal bleeding", hi: "अधिक रक्तस्राव" },
            isRedFlag: true,
          },
          {
            value: "nausea_bloating",
            label: { en: "Nausea or mild bloating", hi: "मतली या पेट फूलना" },
          },
        ],
      },
    ],
  },

  vomiting: {
    condition: "vomiting",
    title: { en: "Vomiting / Ulti", hi: "उल्टी" },
    description: {
      en: "Throwing up or unable to keep fluids down.",
      hi: "उल्टी होना या तरल पदार्थ न पचना।",
    },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Duration (days)", hi: "दिन" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Severity (1 to 10)", hi: "गंभीरता (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Check any applicable:", hi: "लक्षण चुनें:" },
        options: [
          {
            value: "vomiting_blood",
            label: { en: "Blood in vomit", hi: "उल्टी में खून" },
            isRedFlag: true,
          },
          {
            value: "signs_severe_dehydration",
            label: {
              en: "No urination for 8+ hours, extreme thirst, sunken eyes",
              hi: "8 घंटे से पेशाब न होना, अत्यधिक प्यास, सूखी आंखें",
            },
            isRedFlag: true,
          },
          {
            value: "unresponsive",
            label: { en: "Very drowsy or unresponsive", hi: "अत्यधिक सुस्ती या बेहोशी" },
            isRedFlag: true,
          },
        ],
      },
    ],
  },

  diarrhea: {
    condition: "diarrhea",
    title: { en: "Diarrhea / Dast", hi: "दस्त" },
    description: { en: "Frequent loose or watery stools.", hi: "पतले दस्त या पेट खराब होना।" },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Duration (days)", hi: "दिन" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Severity (1 to 10)", hi: "गंभीरता (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Check any applicable:", hi: "लक्षण चुनें:" },
        options: [
          {
            value: "blood_in_stool",
            label: { en: "Blood or mucus in stool", hi: "मल में खून या आंव" },
            isRedFlag: true,
          },
          {
            value: "signs_severe_dehydration",
            label: {
              en: "Severe dehydration, no tears, dizziness",
              hi: "गंभीर निर्जलीकरण, चक्कर आना",
            },
            isRedFlag: true,
          },
        ],
      },
    ],
  },

  skin_issue: {
    condition: "skin_issue",
    title: { en: "Skin Issue / Twacha Samasya", hi: "त्वचा की समस्या" },
    description: { en: "Rash, itching, swelling, or redness.", hi: "खुजली, दाने, सूजन या लालिमा।" },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Duration (days)", hi: "दिन" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Severity (1 to 10)", hi: "गंभीरता (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Check red flags:", hi: "खतरनाक लक्षण:" },
        options: [
          {
            value: "severe_allergic_reaction",
            label: {
              en: "Swelling of face/throat or difficulty breathing",
              hi: "चेहरे/गले में सूजन या सांस लेने में तकलीफ",
            },
            isRedFlag: true,
          },
          {
            value: "rapidly_spreading_rash",
            label: {
              en: "Rash spreading rapidly across body within hours",
              hi: "कुछ ही घंटों में तेजी से फैलता दाना/चकत्ता",
            },
            isRedFlag: true,
          },
          {
            value: "non_blanching_rash",
            label: {
              en: "Purple spots that do not fade when pressed",
              hi: "बैंगनी धब्बे जो दबाने पर गायब नहीं होते",
            },
            isRedFlag: true,
          },
        ],
      },
    ],
  },

  menstrual: {
    condition: "menstrual",
    title: { en: "Menstrual & Reproductive Health", hi: "मासिक धर्म संबंधी समस्या" },
    description: {
      en: "Severe cramps, irregular bleeding, or period pain.",
      hi: "मासिक धर्म में तेज दर्द या असामान्य रक्तस्राव।",
    },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Duration (days)", hi: "दिन" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Pain severity (1 to 10)", hi: "दर्द की तीव्रता (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Check red flags:", hi: "गंभीर लक्षण:" },
        options: [
          {
            value: "soaking_pad_hourly",
            label: {
              en: "Soaking through a pad or tampon every hour",
              hi: "हर घंटे पैड पूरी तरह भीग जाना",
            },
            isRedFlag: true,
          },
          {
            value: "fainting",
            label: { en: "Fainting or severe dizziness", hi: "बेहोश होना या तेज चक्कर आना" },
            isRedFlag: true,
          },
          {
            value: "pregnancy_with_severe_pain",
            label: {
              en: "Severe pain with known or suspected pregnancy",
              hi: "गर्भावस्था में तेज पेट दर्द",
            },
            isRedFlag: true,
          },
        ],
      },
    ],
  },

  stress_anxiety: {
    condition: "stress_anxiety",
    title: { en: "Stress & Mental Health", hi: "तनाव और मानसिक स्वास्थ्य" },
    description: {
      en: "Panic, anxiety, insomnia, or emotional distress.",
      hi: "घबराहट, चिंता, अनिद्रा या अत्यधिक तनाव।",
    },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Duration (days)", hi: "दिन" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Distress level (1 to 10)", hi: "तनाव का स्तर (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Safety questions (Confidential):", hi: "सुरक्षा प्रश्न (गोपनीय):" },
        options: [
          {
            value: "suicidal_intent",
            label: {
              en: "Thoughts of harming yourself or ending your life",
              hi: "खुद को नुकसान पहुंचाने या जान देने के विचार",
            },
            isRedFlag: true,
          },
          {
            value: "self_harm_intent",
            label: {
              en: "Urge or plan to hurt yourself",
              hi: "खुद को चोट पहुंचाने की इच्छा या योजना",
            },
            isRedFlag: true,
          },
          {
            value: "psychosis_signs",
            label: {
              en: "Hearing voices or seeing things others cannot",
              hi: "ऐसी आवाजें सुनना जो दूसरे नहीं सुन सकते",
            },
            isRedFlag: true,
          },
        ],
      },
    ],
  },

  allergy: {
    condition: "allergy",
    title: { en: "Allergy / Reaction", hi: "एलर्जी या रिएक्शन" },
    description: {
      en: "Hives, sneezing, food or drug reaction.",
      hi: "पित्ती, छींकें, दवा या खाने से एलर्जी।",
    },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Duration (days)", hi: "दिन" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Severity (1 to 10)", hi: "गंभीरता (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Anaphylaxis check:", hi: "गंभीर एलर्जी जांच:" },
        options: [
          {
            value: "throat_tightness",
            label: {
              en: "Throat tightness, hoarseness, difficulty swallowing",
              hi: "गले में जकड़न या निगलने में भारी तकलीफ",
            },
            isRedFlag: true,
          },
          {
            value: "swelling_face_lips",
            label: { en: "Swelling of lips, tongue, or eyes", hi: "होंठ, जीभ या आंखों में सूजन" },
            isRedFlag: true,
          },
          {
            value: "severe_allergic_reaction",
            label: {
              en: "Full-body hives with dizziness or breathlessness",
              hi: "पूरे शरीर में चकत्ते और चक्कर या सांस फूलना",
            },
            isRedFlag: true,
          },
        ],
      },
    ],
  },

  minor_injury: {
    condition: "minor_injury",
    title: { en: "Minor Injury / Chot", hi: "हल्की चोट" },
    description: {
      en: "Cut, sprain, burn, scrape, or fall.",
      hi: "कटना, मोच, जलना या गिरने से चोट।",
    },
    questions: [
      {
        id: "durationDays",
        type: "number",
        label: { en: "Days since injury", hi: "चोट लगे कितने दिन हुए" },
        required: true,
      },
      {
        id: "severity",
        type: "scale",
        label: { en: "Pain severity (1 to 10)", hi: "दर्द (1 से 10)" },
        required: true,
      },
      {
        id: "flags",
        type: "multi_choice",
        label: { en: "Emergency check:", hi: "आपातकालीन जांच:" },
        options: [
          {
            value: "severe_bleeding",
            label: {
              en: "Blood spurting or continuous bleeding that will not stop",
              hi: "रक्तस्राव जो दबाने पर भी नहीं रुक रहा",
            },
            isRedFlag: true,
          },
          {
            value: "suspected_fracture_deformity",
            label: {
              en: "Bone is visibly deformed or protruding",
              hi: "हड्डी में टेढ़ापन या टूटने की आशंका",
            },
            isRedFlag: true,
          },
          {
            value: "head_injury_with_confusion",
            label: {
              en: "Head injury followed by vomiting or confusion",
              hi: "सिर की चोट के बाद उल्टी या बेहोशी",
            },
            isRedFlag: true,
          },
          {
            value: "unresponsive",
            label: { en: "Victim is unconscious or unresponsive", hi: "घायल व्यक्ति बेहोश है" },
            isRedFlag: true,
          },
        ],
      },
    ],
  },
};

module.exports = { QUESTIONNAIRES };
