import * as Font from "expo-font";
import { useNavigation } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import Store from "../utils/store";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          "Arvo-Regular": require("../assets/fonts/Arvo-Regular.ttf"),
          "Arvo-Bold": require("../assets/fonts/Arvo-Bold.ttf"),
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
      const board = await Store.get("board");
      if (board === "1") navigation.push("home");
      else navigation.push("dashboard");
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      onLayout={onLayoutRootView}
    >
      <ActivityIndicator animating={true} />
      <Text style={{ paddingTop: 20 }}>Chargement...</Text>
    </View>
  );
}
