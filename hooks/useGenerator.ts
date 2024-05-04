import useCalendar from "@atiladev/usecalendar";
import * as Calendar from "expo-calendar";
import * as ImagePicker from "expo-image-picker";
import { ActionSheetIOS } from "react-native";
import { useTheme } from "react-native-paper";
import Toast from "react-native-toast-message";
import API from "../api";
import { weekDays } from "../utils/constants";
import Store from "../utils/store";

const CAL_ID = "NOCIBE-CALENDRIER";

const useGenerator = () => {
  const { colors } = useTheme();
  const { getPermission, openSettings, createCalendar, getCalendarId } =
    useCalendar("Nocibé", colors.primary, CAL_ID);

  const take = async (callback) => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) await processing(result, callback);
    else callback();
  };
  const library = async (callback) => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) await processing(result, callback);
    else callback();
  };

  const processing = async (result, callback) => {
    const granted = await getPermission();

    if (granted) {
      const events = await API.generate(result);

      if (events.length) {
        const unmount = [];

        const calendarId = await getCalendarId();
        if (!calendarId) {
          await createCalendar();
        }

        try {
          const cal = await Store.get(CAL_ID);

          for (const { title, start, date, end, day, notes } of events) {
            if (cal && title) {
              const event: any = {
                title,
                notes,
                alarms: [
                  {
                    relativeOffset: 0,
                    method: Calendar.AlarmMethod.ALERT,
                  },
                ],
              };

              if (start) event.startDate = start;
              if (end) event.endDate = end;
              if (!end && !start) {
                event.startDate = date;
                event.endDate = date;
                event.allDay = true;
              }

              await Calendar.createEventAsync(cal, event);
            } else {
              unmount.push(day);
            }
          }
        } catch (e) {
          Toast.show({
            type: "error",
            text1: "Une erreur est survenue... 😞",
            text2: "Impossible d'ajouter au calendrier.",
          });
        }

        if (unmount.length) {
          Toast.show({
            type: "error",
            text1: "Des jours n'ont pas été ajouté, réessaye !",
            text2: `Il manque : ${unmount
              .map((id) => weekDays.find((day) => day.id === id).label)
              .join(", ")}`,
          });
        } else {
          Toast.show({
            type: "success",
            text1: "Super ! ✨",
            text2: "Ton calendrier est à jour.",
          });
        }
        callback();
      } else {
        Toast.show({
          type: "error",
          text1: "Une erreur est survenue... 😞",
          text2: "Impossible de récupérer les horaires.",
        });
      }
    } else {
      openSettings();
    }
  };

  const choose = (callback) =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Annuler", "Prendre un photo", "Ma bibliothèque"],
        cancelButtonIndex: 0,
        userInterfaceStyle: "dark",
      },
      (buttonIndex) => {
        if (buttonIndex === 0) callback();
        else if (buttonIndex === 1) take(callback);
        else if (buttonIndex === 2) library(callback);
      }
    );

  return { take, library, choose };
};

export default useGenerator;
