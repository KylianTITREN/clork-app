import { useEffect, useState } from "react";
import Store from "../utils/store";

const useStorage = () => {
  const [storage, setStorage] = useState({
    firstname: "",
    lastname: "",
    chill: null,
  });

  useEffect(() => {
    (async () => {
      const usr = await Store.get("user");
      const chll = await Store.get("chill");
      set({ ...usr, chill: chll });
    })();
  }, []);

  const set = ({ firstname, lastname, chill }) => {
    setStorage({
      lastname,
      firstname,
      chill,
    });
  };

  return { storage, set };
};

export default useStorage;
