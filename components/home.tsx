import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useState } from "react";
import { Dimensions, View } from "react-native";
import {
  ActivityIndicator,
  IconButton,
  Switch,
  Text,
  useTheme,
} from "react-native-paper";
import { useGenerator } from "../hooks";
import Store from "../utils/store";
import Bold from "./common/bold";

const Home = () => {
  const generator = useGenerator();
  const navigation = useNavigation();
  const { colors } = useTheme();

  const [sunday, setSunday] = useState(false);
  const [loading, setLoading] = useState(false);

  const { width, height } = Dimensions.get("window");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await Store.remove("sunday");
        setSunday(false);
      })();
    }, [])
  );

  const picture = async () => {
    setLoading(true);
    await Store.set("sunday", sunday === true ? "1" : "0");
    generator.choose(() => {
      setLoading(false);
    });
  };

  return (
    <View style={{ height, width, flex: 1 }}>
      <View
        style={{
          width,
          height,
          alignItems: "center",
          gap: 10,
          justifyContent: "center",
        }}
      >
        <IconButton
          icon="account"
          containerColor={colors.primary}
          iconColor="white"
          style={{
            position: "absolute",
            top: 10,
            right: 20,
            zIndex: 100,
          }}
          mode="contained"
          size={20}
          onPress={() => navigation.push("profile")}
        />
        <View
          style={{
            height: "50%",
            alignItems: "center",
            gap: 30,
            width: "90%",
          }}
        >
          <Text variant="headlineLarge" style={{ marginBottom: 60 }}>
            Ajoute une <Bold>nouvelle semaine !</Bold>
          </Text>
          {loading ? (
            <ActivityIndicator
              size={75}
              animating={true}
              color={colors.primary}
            />
          ) : (
            <IconButton
              icon="plus"
              style={{ borderColor: colors.primary }}
              iconColor={colors.primary}
              mode="outlined"
              size={75}
              onPress={picture}
            />
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 30,
          }}
        >
          <Text variant="titleMedium">Je travaille Dimanche</Text>
          <Switch
            disabled={loading}
            value={sunday}
            onValueChange={() => setSunday((val) => !val)}
          />
        </View>
      </View>
    </View>
  );
};

export default Home;
