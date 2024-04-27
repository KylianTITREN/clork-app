import { useFonts } from "expo-font";
import { Text, MD3LightTheme as Theme } from "react-native-paper";

const Bold = ({ children, colorized }) => {
  const [fontsLoaded, fontError] = useFonts({
    "Arvo-Bold": require("../../assets/fonts/Arvo-Bold.ttf"),
  });

  return (
    <Text
      style={{
        fontFamily: "Arvo-Bold",
        color: colorized ? Theme.colors.primary : undefined,
      }}
    >
      {children}
    </Text>
  );
};

export default Bold;
