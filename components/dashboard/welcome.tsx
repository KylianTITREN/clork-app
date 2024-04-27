import { View } from "react-native";
import { Text } from "react-native-paper";
import Bold from "../common/bold";

const Welcome = () => {
  return (
    <View>
      <Text variant="headlineLarge">
        Bienvenue sur <Bold colorized>Clork</Bold>
      </Text>
    </View>
  );
};

export default Welcome;
