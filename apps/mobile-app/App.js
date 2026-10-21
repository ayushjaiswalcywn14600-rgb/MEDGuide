/**
 * MEDGUIDE mobile app entry point (React Native).
 *
 * Screens to wire up via @react-navigation/native-stack, in MVP order:
 *   1. Splash + language selection
 *   2. Login/signup (mobile OTP)
 *   3. Consent & privacy preferences
 *   4. Home dashboard
 *   5. "Describe Your Problem" input page
 *   6. Common Problems Hub
 *   7. Guided symptom questionnaire
 *   8. Triage result: Green / Yellow / Red
 *   9. Find doctor / clinic
 *  10. Doctor profile and booking
 *  11. Video consultation room
 *  12. Pharmacy and medicine comparison
 *  13. Health records and reports
 *  14. Daily health tracker
 *  15. SOS emergency page (also reachable from lock-screen widget)
 *  16. Profile, family members, consent, and settings
 *  17. Testimonials, FAQ, contact, privacy policy, terms
 *
 * Each screen should live under `src/screens/<ScreenName>.js` with API calls
 * going through a shared `src/api/client.js` that attaches the JWT and talks
 * to the backend defined in `../../backend`.
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaView, Text } from "react-native";

const Stack = createNativeStackNavigator();

function PlaceholderScreen({ route }) {
  return (
    <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>{route.name} — screen scaffold</Text>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Splash">
        <Stack.Screen name="Splash" component={PlaceholderScreen} />
        <Stack.Screen name="Login" component={PlaceholderScreen} />
        <Stack.Screen name="Consent" component={PlaceholderScreen} />
        <Stack.Screen name="Home" component={PlaceholderScreen} />
        <Stack.Screen name="DescribeProblem" component={PlaceholderScreen} />
        <Stack.Screen name="CommonProblemsHub" component={PlaceholderScreen} />
        <Stack.Screen name="GuidedQuestionnaire" component={PlaceholderScreen} />
        <Stack.Screen name="TriageResult" component={PlaceholderScreen} />
        <Stack.Screen name="FindDoctor" component={PlaceholderScreen} />
        <Stack.Screen name="DoctorProfile" component={PlaceholderScreen} />
        <Stack.Screen name="VideoConsultation" component={PlaceholderScreen} />
        <Stack.Screen name="Pharmacy" component={PlaceholderScreen} />
        <Stack.Screen name="HealthRecords" component={PlaceholderScreen} />
        <Stack.Screen name="DailyTracker" component={PlaceholderScreen} />
        <Stack.Screen name="SOS" component={PlaceholderScreen} />
        <Stack.Screen name="Profile" component={PlaceholderScreen} />
        <Stack.Screen name="Testimonials" component={PlaceholderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
