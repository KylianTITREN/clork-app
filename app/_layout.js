import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import {
  configureFonts,
  MD3LightTheme,
  PaperProvider,
} from "react-native-paper";

const Layout = () => {
  const [fontsLoaded, fontError] = useFonts({
    "Arvo-Regular": require("../assets/fonts/Arvo-Regular.ttf"),
  });

  const theme = {
    ...MD3LightTheme,
    fonts: configureFonts({
      config: {
        fontFamily: "Arvo-Regular",
      },
    }),
  };

  return (
    <PaperProvider theme={theme}>
      <Stack />
    </PaperProvider>
  );
};

export default Layout;
