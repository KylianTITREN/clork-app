import { SafeAreaView } from "react-native";
import ProfileComponent from "../components/profile";

const Profile = () => {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ProfileComponent />
    </SafeAreaView>
  );
};

export default Profile;
