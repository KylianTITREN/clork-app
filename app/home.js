import { SafeAreaView } from "react-native";
import HomeComponent from "../components/home";

const Home = () => {
  return (
    <SafeAreaView
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <HomeComponent />
    </SafeAreaView>
  );
};

export default Home;
