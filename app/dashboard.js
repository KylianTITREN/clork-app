import { SafeAreaView } from "react-native";
import DashboardComponent from "../components/dashboard";

const Dashboard = () => {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <DashboardComponent />
    </SafeAreaView>
  );
};

export default Dashboard;
