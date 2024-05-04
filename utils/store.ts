import AsyncStorage from "@react-native-async-storage/async-storage";

const Store = {
  set: async (key: string, value: any) => {
    let val = value;

    switch (typeof value) {
      case "object":
        val = JSON.stringify(value);
        break;
      case "number":
        val = value.toString();
        break;
      default:
        val = value;
        break;
    }

    await AsyncStorage.setItem(key, val);
  },
  get: async (key: string) => {
    try {
      const jsonValue = await AsyncStorage.getItem(key);

      if (jsonValue === null) return null;
      if (jsonValue.includes("{")) return JSON.parse(jsonValue);
      else return jsonValue;
    } catch (e) {
      return null;
    }
  },
  remove: async (key: string) => {
    await AsyncStorage.removeItem(key);
  },
  reset: async () => {
    await AsyncStorage.clear();
  },
};

export default Store;
