import * as FileSystem from "expo-file-system";
import Store from "../utils/store";

class API {
  constructor() {
    this.url = process.env.EXPO_PUBLIC_API_URL;
    this.bearer = `Bearer ${process.env.EXPO_PUBLIC_BEARER}`;
  }

  async generate(result) {
    const user = await Store.get("user");
    const chill = await Store.get("chill");
    const sunday = await Store.get("sunday");

    return FileSystem.uploadAsync(
      `${this.url}/generate?lastname=${user.lastname}&firstname=${user.firstname}&chill=${chill}&sunday=${sunday}`,
      result.assets[0].uri,
      {
        httpMethod: "POST",
        headers: {
          Authorization: this.bearer,
        },
        responseType: "json",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
      }
    )
      .then((response) => {
        const resp = JSON.parse(response.body);
        return resp.data;
      })
      .catch((error) => {
        console.error(error);
        return null;
      });
  }
}

export default new API();
