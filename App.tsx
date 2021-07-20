import Olm from "@matrix-org/olm/olm_legacy"; // using legacy if default wasm doesn't load
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { MemoryStore } from "matrix-js-sdk";
import React, { useState } from "react";
import {
  Button,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import "./polyfill";
import sdk from "./rn-matrix";

declare var global: any;
global.crypto = {
  getRandomValues: (array: any[]) =>
    array.map(() => Math.floor(Math.random() * 256)),
};

window.Olm = Olm;

const BASE_URL = "http://192.168.178.20:8008";
const STORAGE_DEVICE_ID = "device_id";

const MATRIX_CLIENT_START_OPTIONS = {
  initialSyncLimit: 10,
  //request: request,
  lazyLoadMembers: true,
  pendingEventOrdering: "detached",
  timelineSupport: true,
  unstableClientRelationAggregation: true,
  store: new MemoryStore({
    localStorage: AsyncStorage as any,
  }),
  //cryptoStore: new AsyncCryptoStore(AsyncStorage),
  sessionStore: {
    getLocalTrustedBackupPubKey: () => null,
  },
};

let client: sdk.MatrixClient | null = null;
let loginResult: any;

export default function App() {
  const [storedDeviceId, setStoredDeviceId] = useState<string>("");
  const [joinedRoomId, setJoinedRoomId] = useState<string>(
    "!gmKoGceSQXuFtkresp:my.matrix.host"
  );
  const [lastMessage, setLastMessage] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [sendMessageText, setSendMessageText] = useState<string>("");

  React.useEffect(() => {}, []);

  const initClient = async (deviceId: string) => {
    console.log("## Login result", loginResult);
    try {
      client = await sdk.createClient({
        baseUrl: BASE_URL,
        userId: loginResult.user_id,
        accessToken: loginResult.access_token,
        deviceId,
        ...MATRIX_CLIENT_START_OPTIONS,
      });

      if (client === null) {
        throw new Error("### Client is null!");
      }

      client.once(
        "sync",
        async function (state: string, prevState: any, res: any) {
          console.log(`### STATE is ${state}`);
          // after client is ready
          if (state === "PREPARED") {
            // ! THIS MUST BE REPLACED -> Devices must be trusted
            client!.setGlobalErrorOnUnknownDevices(false);
            console.log(`Ready to rumble ...`);

            await client!.uploadKeys();
            client!.exportRoomKeys();

            client!.on("Event.decrypted", (event: sdk.MatrixEvent) => {
              if (event.getType() === "m.room.message") {
                const eventContent = event.getClearContent() as {
                  body: string;
                  msgtype: string;
                } | null;

                if (eventContent) {
                  setLastMessage(eventContent.body);
                }
              } else {
                console.log("decrypted an event of type", event.getType());
                console.log(event);
              }
            });
          }
        }
      );
      await client!.initCrypto();
      await client!.startClient({});
    } catch (error) {
      console.log("error on init", error);
    }
  };

  const performLogin = async () => {
    try {
      const registrationClient = sdk.createClient(BASE_URL);

      loginResult = await registrationClient.login("m.login.password", {
        user: userName,
        password: password,
      });

      let resultStoredDeviceId = await AsyncStorage.getItem(STORAGE_DEVICE_ID);
      if (resultStoredDeviceId !== null) {
        setStoredDeviceId(resultStoredDeviceId);
      }

      if (loginResult && resultStoredDeviceId === null) {
        console.log(`Storing device id ${resultStoredDeviceId}`);
        // * Store device ID in async storage
        await AsyncStorage.setItem(STORAGE_DEVICE_ID, loginResult.device_id);
        resultStoredDeviceId = loginResult.device_id;
      }

      initClient(resultStoredDeviceId!);
    } catch (error) {
      console.log(error);
    }
  };

  const joinRoom = async () => {
    try {
      console.log("## Client is running ... ", client?.clientRunning);
      const result = await client!.joinRoom(joinedRoomId, { syncRoom: true });
      await client?.setRoomEncryption(joinedRoomId, {
        algorithm: "m.megolm.v1.aes-sha2",
      });

      // * Trust all devices in a room
      // let members = (await result.getEncryptionTargetMembers()).map(
      //   (x: any) => x["userId"]
      // );
      // let memberkeys = await client!.downloadKeys(members);
      // for (const userId in memberkeys) {
      //   for (const deviceId in memberkeys[userId]) {
      //     await client!.setDeviceVerified(userId, deviceId);
      //   }
      // }

      const decryptResult = await result.decryptCriticalEvents(); // ==> This throws cannot decrypt critical events Promise.allSettled is not a function (polyfill is there)
      console.log("## DECRYPT RESULT", decryptResult);
    } catch (error) {
      console.log(`Error joining room`, error);
    }
  };

  const deleteDevices = async () => {
    try {
      const myDevices = await client?.getDevices();
      console.log(`You have ${myDevices.length} devices`, myDevices);
      await client?.deleteDevice("AIMENHSJLJ");
    } catch (error) {
      console.log("Error getting rooms", error);
    }
  };

  const sendRoomMessage = async () => {
    try {
      if (client === null) {
        throw new Error("Client is null!");
      }
      client.sendTextMessage(joinedRoomId, sendMessageText);
    } catch (error) {
      console.log(`Error sending message`, error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text>Letzte Nachricht:</Text>
      <Text>{lastMessage}</Text>
      <View
        style={{
          height: 2,
          width: "100%",
          borderBottomWidth: 1,
          borderBottomColor: "grey",
          marginVertical: 10,
        }}
      ></View>
      <View>
        <TextInput
          style={{
            height: 50,

            padding: 10,
            borderColor: "black",
            borderWidth: 1,
          }}
          value={userName}
          placeholder="Username"
          autoCapitalize={"none"}
          onChange={(value) => setUserName(value.nativeEvent.text)}
        />
        <TextInput
          style={{
            height: 50,

            padding: 10,
            borderColor: "black",
            borderWidth: 1,
          }}
          value={password}
          placeholder="Password"
          autoCapitalize={"none"}
          onChange={(value) => setPassword(value.nativeEvent.text)}
        />
      </View>
      <Button onPress={performLogin} title="Login an start client" />

      <View
        style={{
          height: 2,
          width: "100%",
          borderBottomWidth: 1,
          borderBottomColor: "grey",
          marginVertical: 10,
        }}
      ></View>

      <Button onPress={joinRoom} title="Join Room" />

      <View
        style={{
          height: 2,
          width: "100%",
          borderBottomWidth: 1,
          borderBottomColor: "grey",
          marginVertical: 10,
        }}
      ></View>
      <TextInput
        style={{
          height: 50,

          padding: 10,
          borderColor: "black",
          borderWidth: 1,
        }}
        value={sendMessageText}
        placeholder="Message..."
        autoCapitalize={"sentences"}
        onChange={(value) => setSendMessageText(value.nativeEvent.text)}
      />

      <Button onPress={sendRoomMessage} title="Send Room Message" />
      <View
        style={{
          height: 2,
          width: "100%",
          borderBottomWidth: 1,
          borderBottomColor: "grey",
          marginVertical: 10,
        }}
      ></View>
      <Button onPress={deleteDevices} title="Delete Devices" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
  },
});
