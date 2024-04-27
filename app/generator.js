import * as Calendar from "expo-calendar";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Button, Platform, SafeAreaView } from "react-native";
import API from "../api";

const Generator = () => {
  useEffect(() => {
    permissions();
  }, []);

  const permissions = async () => {
    await Calendar.requestCalendarPermissionsAsync();
    await ImagePicker.requestCameraPermissionsAsync();
  };

  const take = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.cancelled) await processing(result);
  };
  const library = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.cancelled) await processing(result);
  };

  const processing = async (result) => {
    const events = await API.generate(result);

    if (events.length) {
      if (Platform.OS === "ios") {
        let cal = await Calendar.getCalendarsAsync();

        if (!cal.length) {
          const { id, source } = await Calendar.getDefaultCalendarAsync();
          cal = await Calendar.createCalendarAsync({
            title: "Nocibé",
            color: "pink",
            entityType: Calendar.EntityTypes.EVENT,
            sourceId: id,
            source,
            name: "internalCalendarName",
            ownerAccount: "personal",
            accessLevel: Calendar.CalendarAccessLevel.OWNER,
          });

          for (const event of events) {
            await Calendar.createEventAsync(cal.id || cal, {
              calendarId: cal.id || cal,
              ...event,
            });
          }
        }
      }
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <Stack.Screen options={{ headerTitle: "Clork" }} />
      <Button title="Prendre une photo" onPress={take} />
      <Button title="Sélectionner une photo" onPress={library} />
    </SafeAreaView>
  );
};

export default Generator;
