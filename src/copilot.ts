import { spawn, ChildProcess } from "child_process";
import path from "path";

const server: ChildProcess = spawn("node", [
  path.join(__dirname, "../src/copilot-vim-dist/language-server.js"),
  "--stdio",
]);

let requestId = 0;
const resolveMap = new Map<number, (payload: object) => void | Promise<void>>();
const rejectMap = new Map<number, (payload: object) => void | Promise<void>>();

export const sendMessage = (data: object): void => {
  const dataString = JSON.stringify({ ...data, jsonrpc: "2.0" });
  const contentLength = Buffer.byteLength(dataString, "utf8");
  const rpcString = `Content-Length: ${contentLength}\r\n\r\n${dataString}`;
  server.stdin?.write(rpcString);
};

export const sendRequest = (
  method: string,
  params: object
): Promise<object> => {
  sendMessage({ id: ++requestId, method, params });
  return new Promise((resolve, reject) => {
    resolveMap.set(requestId, resolve);
    rejectMap.set(requestId, reject);
  });
};

export const sendNotification = (method: string, params: object): void => {
  sendMessage({ method, params });
};

const handleReceivedPayload = (payload: Record<string, unknown>): void => {
  if ("id" in payload) {
    if ("result" in payload) {
      const resolve = resolveMap.get(payload.id as number);
      if (resolve) {
        resolve(payload.result as object);
        resolveMap.delete(payload.id as number);
      }
    } else if ("error" in payload) {
      const reject = rejectMap.get(payload.id as number);
      if (reject) {
        reject(payload.error as object);
        rejectMap.delete(payload.id as number);
      }
    }
  }
};

server.stdout?.on("data", (data: Buffer) => {
  const rawString: string = data.toString("utf-8");
  const payloadStrings = rawString
    .split(/Content-Length: \d+\r\n\r\n/)
    .filter((s) => s);

  for (const payloadString of payloadStrings) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadString);
    } catch (e) {
      console.error(`Unable to parse payload: ${payloadString}`, e);
      continue;
    }
    handleReceivedPayload(payload);
  }
});

// /* Main */
// const main = async (): Promise<void> => {
//   // Wait for server to start
//   await wait(1000);

//   console.log("1");

//   // Send `initialize` request
//   await sendRequest("initialize", {
//     capabilities: { workspace: { workspaceFolders: true } },
//   });
//   console.log("2");
//   // Send `initialized` notification
//   sendNotification("initialized", {});

//   // Send `textDocument/didOpen` notification
//   sendNotification("textDocument/didOpen", {
//     textDocument: {
//       uri: "file:///home/fakeuser/my-project/test.py",
//       languageId: "python",
//       version: 0,
//       text: "def fib():\n",
//     },
//   });

//   console.log("4");

//   // Send `getCompletions` request to get completions
//   const completions = await sendRequest("textDocument/inlineCompletion", {
//     version: 0,
//     position: { line: 1, character: 19 },
//     textDocument: { uri: "file:///home/fakeuser/my-project/test.py" },
//     context: { triggerKind: 1 },
//   });
//   console.log("Completions:", completions);
// };
