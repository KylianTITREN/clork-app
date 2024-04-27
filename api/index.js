import * as FileSystem from "expo-file-system";

class API {
  constructor() {
    this.url = process.env.EXPO_PUBLIC_API_URL;
    this.bearer = `Bearer ${process.env.EXPO_PUBLIC_BEARER}`;
  }

  async generate(result) {
    return FileSystem.uploadAsync(
      `${this.url}/generate?lastname=Copin&firstname=Typhanie&chill=6&sunday=0`,
      result.assets[0].uri,
      {
        httpMethod: "POST",
        headers: {
          Authorization: this.bearer,
        },
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
      }
    )
      .then((response) => {
        console.log(response.body);
        return response.body;
      })
      .catch((error) => {
        console.error(error);
        return null;
      });
  }
}

export default API;
