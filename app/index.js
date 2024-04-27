import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaView } from "react-native";

const Home = () => {
  useEffect(() => {}, []);

  return (
    <SafeAreaView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <Stack.Screen options={{ headerTitle: "", headerShown: false }} />
    </SafeAreaView>
  );
};

export default Home;
