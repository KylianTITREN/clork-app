import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  configureFonts,
  MD3LightTheme,
  PaperProvider,
} from "react-native-paper";
import Toast from "react-native-toast-message";

const Layout = () => {
  const colors = {
    pink: {
      ...MD3LightTheme.colors,
      primary: "#FFAFE1",
      onPrimary: "#000000",
      primaryContainer: "#CA3C66",
      onPrimaryContainer: "#FFDAE1",
      secondaryContainer: "#ffd6ef",
    },
    navy: {
      ...MD3LightTheme.colors,
      primary: "#000080",
      onPrimary: "#FFFFFF",
      primaryContainer: "#001F3F",
      onPrimaryContainer: "#80D4FF",
      secondaryContainer: "#4169E1",
    },
  };

  const theme = {
    ...MD3LightTheme,
    colors:
      process.env.EXPO_PUBLIC_THEME === "navy" ? colors.navy : colors.pink,
    fonts: configureFonts({
      config: {
        fontFamily: "Arvo-Regular",
      },
    }),
  };

  return (
    <PaperProvider theme={theme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
        <Toast />
      </GestureHandlerRootView>
    </PaperProvider>
  );
};

export default Layout;
