import { useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { Dimensions, KeyboardAvoidingView, View } from "react-native";
import {
  Button,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useStorage } from "../hooks";
import { weekDays } from "../utils/constants";
import Store from "../utils/store";

const Profile = () => {
  const { width, height } = Dimensions.get("window");
  const { colors } = useTheme();
  const navigation = useNavigation();

  const { storage, set } = useStorage();

  const [user, setUser] = useState({ firstname: "", lastname: "" });
  const { firstname, lastname } = user;

  const [chill, setChill] = useState(null);

  useEffect(() => {
    setUser({ firstname: storage.firstname, lastname: storage.lastname });
    setChill(parseInt(storage.chill));
  }, [storage]);

  const change = (text: string, name: string) => {
    setUser({ ...user, [name]: text });
  };

  const select = (day: number) => {
    setChill(day);
  };

  const saving = async () => {
    set({ ...user, chill });
    Store.set("user", user);
    Store.set("chill", chill);
  };

  const reset = async () => {
    await Store.reset();
    navigation.push("dashboard");
  };

  const edited =
    storage.firstname !== firstname ||
    storage.lastname !== lastname ||
    parseInt(storage.chill) !== chill;

  return (
    <View style={{ height, width, flex: 1 }}>
      <KeyboardAvoidingView
        behavior="padding"
        enabled
        style={{
          width,
          height,
          paddingHorizontal: "10%",
          alignItems: "center",
          gap: 90,
          paddingTop: 100,
          justifyContent: "flex-start",
        }}
      >
        <View
          style={{
            position: "absolute",
            flexDirection: "row",
            top: 10,
            left: 20,
            zIndex: 100,
            width: width - 40,
            justifyContent: "space-between",
          }}
        >
          <IconButton
            icon="arrow-left"
            containerColor={colors.primary}
            iconColor="white"
            mode="contained"
            size={20}
            onPress={() => navigation.goBack()}
          />
          {process.env.NODE_ENV === "development" && (
            <IconButton
              icon="refresh"
              containerColor={colors.secondary}
              iconColor="white"
              mode="contained"
              size={20}
              onPress={reset}
            />
          )}
        </View>
        <View style={{ gap: 20, width: "100%" }}>
          <Text variant="headlineSmall">Tu es</Text>
          <TextInput
            style={{ width: "100%" }}
            mode="outlined"
            label="Nom"
            value={lastname}
            onChangeText={(text) => change(text, "lastname")}
          />
          <TextInput
            style={{ width: "100%" }}
            mode="outlined"
            label="Prénom"
            value={firstname}
            onChangeText={(text) => change(text, "firstname")}
          />
        </View>

        <View style={{ gap: 20, width: "100%" }}>
          <Text variant="headlineSmall">Ton jour de repos</Text>
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              justifyContent: "flex-start",
              width: "80%",
            }}
          >
            {weekDays.map((day) => (
              <Button
                compact
                contentStyle={{ margin: 0, padding: 0, width: 36 }}
                key={day.id}
                style={{ opacity: chill === day.id ? 1 : 0.7 }}
                mode={`contained${chill === day.id ? "" : "-tonal"}`}
                onPress={() => select(day.id)}
              >
                {day.name}
              </Button>
            ))}
          </View>
        </View>
        <Button
          mode="contained"
          disabled={!edited}
          style={{
            position: "absolute",
            bottom: 200,
          }}
          onPress={saving}
        >
          Enregistrer les modifications
        </Button>
      </KeyboardAvoidingView>
    </View>
  );
};

export default Profile;
