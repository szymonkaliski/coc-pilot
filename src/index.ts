import {
  ExtensionContext,
  workspace,
  languages,
  CompletionItem,
  CompletionItemKind,
  CompletionTriggerKind,
  commands,
  window,
} from "coc.nvim";
import { sendNotification, sendRequest } from "./copilot";

export async function activate(context: ExtensionContext): Promise<void> {
  await sendRequest("initialize", {
    capabilities: { workspace: { workspaceFolders: true } },
  });

  sendNotification("initialized", {});

  const status = await sendRequest("checkStatus", {});

  if (!status.user) {
    window.showWarningMessage(
      `coc-pilot is not authenticated, run 'coc-pilot.signIn'!`
    );
  }

  workspace.document.then((document) => {
    sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: document.uri,
        languageId: document.languageId,
        version: document.version,
        text: document.textDocument.getText(),
      },
    });
  });

  context.subscriptions.push(
    workspace.onDidOpenTextDocument((document) => {
      sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: document.uri,
          languageId: document.languageId,
          version: document.version,
          text: document.getText(),
        },
      });
    }),

    workspace.onDidChangeTextDocument((document) => {
      sendNotification("textDocument/didChange", {
        textDocument: {
          uri: document.textDocument.uri,
          version: document.textDocument.version,
        },
        contentChanges: document.contentChanges,
      });
    }),

    workspace.onDidCloseTextDocument((document) => {
      sendNotification("textDocument/didClose", {
        textDocument: {
          uri: document.uri,
        },
      });
    }),

    languages.registerCompletionItemProvider("copilot", "COP", null, {
      provideCompletionItems: async (
        document,
        position
      ): Promise<CompletionItem[]> => {
        const result = await sendRequest("textDocument/inlineCompletion", {
          version: document.version,
          position,
          textDocument: { uri: document.uri },
          context: { triggerKind: CompletionTriggerKind.Invoked },
        });

        return result.items.map((c) => {
          return {
            // three spaces - hack to sort on top of the list
            sortText: "   " + c.insertText,
            label: c.insertText.split("\n")[0],
            detail: c.insertText,
            kind: CompletionItemKind.Snippet,
            textEdit: {
              range: c.range,
              newText: c.insertText,
            },
          };
        });
      },
    }),

    commands.registerCommand("coc-pilot.signIn", async () => {
      const status = await sendRequest("checkStatus", {});
      if (status.user) {
        window.showInformationMessage(
          "coc-pilot is already signed in as: " + status.user
        );
        return;
      }

      const data = await sendRequest("signInInitiate", {});

      await window.showDialog({
        content: `
Open ${data.verificationUri} in the browser and authenticate with \`${data.userCode}\` one-time code, confirm once ready.
        `,

        buttons: [
          {
            index: 0,
            text: "Authenticated in the browser",
          },
          {
            index: 1,
            text: "Cancel",
          },
        ],

        callback: async (idx) => {
          if (idx === 1) {
            return;
          }

          window.showInformationMessage("coc-pilot checking sign in status...");

          const request = await sendRequest("signInConfirm", {
            userCode: data.userCode,
          });

          if (request.status === "error") {
            window.showErrorMessage(
              "coc-pilot sign in failed: " + request.error
            );
            return;
          }

          const status = await sendRequest("checkStatus", {});

          window.showInformationMessage(
            "coc-pilot signed in as: " + status.user
          );
        },
      });
    }),

    commands.registerCommand("coc-pilot.signOut", async () => {
      await sendRequest("signOut", {});
      window.showInformationMessage("coc-pilot signed out");
    })
  );
}
