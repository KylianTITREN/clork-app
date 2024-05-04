import { useNavigation } from "expo-router";
import { useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  PixelRatio,
  StyleSheet,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import {
  Button,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import useGenerator from "../hooks/useGenerator";
import { weekDays } from "../utils/constants";
import Store from "../utils/store";
import Bold from "./common/bold";

const Dashboard = () => {
  const generator = useGenerator();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const scrollViewRef = useRef(null);

  const [user, setUser] = useState({ firstname: "", lastname: "" });
  const { firstname, lastname } = user;

  const [chill, setChill] = useState(null);

  const [sliderState, setSliderState] = useState({ currentPage: 0 });
  const { width, height } = Dimensions.get("window");

  const setSliderPage = (event: any) => {
    const { currentPage } = sliderState;
    const { x } = event.nativeEvent.contentOffset;
    const indexOfNextScreen = Math.floor(x / width);
    if (indexOfNextScreen !== currentPage) {
      setSliderState({
        ...sliderState,
        currentPage: indexOfNextScreen,
      });
    }
  };

  const next = () => {
    scrollViewRef.current?.scrollTo({
      x: width * (sliderState.currentPage + 1),
      animated: true,
    });
  };

  const previous = () => {
    scrollViewRef.current?.scrollTo({
      x: width * (sliderState.currentPage - 1),
      animated: true,
    });
  };

  const change = (text: string, name: string) => {
    setUser({ ...user, [name]: text });
    Store.set("user", { ...user, [name]: text });
  };

  const select = (day: number) => {
    setChill(day);
    Store.set("chill", day);
  };

  const picture = () => {
    Store.set("board", 1);
    generator.choose(({ text1, text2 }) => {
      navigation.push("home");
    });
  };

  const { currentPage: pageIndex } = sliderState;

  return (
    <View style={{ height, width, flex: 1 }}>
      <View style={styles.paginationWrapper}>
        {Array.from(Array(4).keys()).map((key, index) => (
          <View
            style={[
              styles.paginationDots,
              {
                opacity: pageIndex === index ? 1 : 0.2,
                backgroundColor: colors.primary,
              },
            ]}
            key={index}
          />
        ))}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={false}
        ref={scrollViewRef}
        horizontal={true}
        scrollEventThrottle={16}
        pagingEnabled={true}
        showsHorizontalScrollIndicator={false}
        onScroll={(event: any) => {
          setSliderPage(event);
        }}
      >
        <View
          style={{
            width,
            height,
            alignItems: "center",
            gap: 10,
            justifyContent: "center",
          }}
        >
          <View style={{ height: "25%", alignItems: "center", gap: 10 }}>
            <Text variant="headlineLarge">Bienvenue sur</Text>
            <Text variant="displayLarge">
              <Bold colorized>Clork</Bold>
            </Text>
          </View>
          <Button
            icon="arrow-right"
            mode="contained"
            contentStyle={{ flexDirection: "row-reverse" }}
            style={{
              position: "absolute",
              bottom: 200,
            }}
            onPress={next}
          >
            C'est parti !
          </Button>
        </View>
        <KeyboardAvoidingView
          behavior="padding"
          enabled
          style={{
            width,
            height,
            alignItems: "center",
            gap: 10,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              height: "50%",
              alignItems: "center",
              gap: 30,
              width: "80%",
            }}
          >
            <Text variant="headlineLarge" style={{ marginBottom: 60 }}>
              Dis m'en plus sur toi
            </Text>
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
          <Button
            mode="contained"
            disabled={!firstname || !lastname}
            style={{
              position: "absolute",
              bottom: 200,
            }}
            onPress={next}
          >
            Continuer
          </Button>
        </KeyboardAvoidingView>
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
            icon="arrow-left"
            containerColor={colors.primary}
            iconColor="white"
            style={{
              position: "absolute",
              top: 10,
              left: 20,
              zIndex: 100,
            }}
            mode="contained"
            size={20}
            onPress={previous}
          />
          <View
            style={{
              height: "50%",
              alignItems: "center",
              gap: 30,
              width: "80%",
            }}
          >
            <Text variant="headlineLarge" style={{ marginBottom: 60 }}>
              Quel est ton jour de repos ?
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
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
            disabled={chill === null}
            style={{
              position: "absolute",
              bottom: 200,
            }}
            onPress={next}
          >
            Terminer
          </Button>
        </View>
        <View
          style={{
            width,
            height,
            alignItems: "center",
            gap: 10,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              height: "50%",
              alignItems: "center",
              gap: 30,
              width: "90%",
            }}
          >
            <Text variant="headlineLarge" style={{ marginBottom: 60 }}>
              Ajoute ta <Bold>première semaine !</Bold>
            </Text>
            <IconButton
              icon="plus"
              containerColor={colors.primary}
              iconColor="white"
              mode="contained"
              size={75}
              onPress={picture}
            />
          </View>
          <Button
            mode="outlined"
            style={{
              position: "absolute",
              bottom: 200,
            }}
            textColor="black"
            onPress={() => {
              Store.set("board", 1);
              navigation.push("home");
            }}
          >
            Plus tard
          </Button>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  imageStyle: {
    height: PixelRatio.getPixelSizeForLayoutSize(135),
    width: "100%",
  },
  wrapper: {
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 30,
  },
  header: {
    fontSize: 30,
    fontWeight: "bold",
    marginBottom: 20,
  },
  paragraph: {
    fontSize: 17,
  },
  paginationWrapper: {
    position: "absolute",
    top: 30,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  paginationDots: {
    height: 4,
    width: 15,
    borderRadius: 10 / 2,
    marginLeft: 10,
  },
});

export default Dashboard;
