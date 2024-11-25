import {
  ExtensionContext,
  workspace,
  languages,
  CompletionItem,
  CompletionItemKind,
  CompletionTriggerKind,
  commands,
  window,
  events,
  MoveEvents,
  Range,
} from "coc.nvim";
import { sendNotification, sendRequest } from "./copilot";

type CopilotInlineCompletionItem = CompletionItem & {
  insertText: string;
  range: Range;
};

export async function activate(context: ExtensionContext): Promise<void> {
  let state = {
    lastPosition: { line: -1, character: -1 },
    lastResults: [] as CompletionItem[],
    lastDocument: { uri: "", version: -1 },
  };

  await sendRequest("initialize", {
    capabilities: { workspace: { workspaceFolders: true } },
  });

  sendNotification("initialized", {});

  const status = await sendRequest("checkStatus", {});

  if (!("user" in status)) {
    window.showWarningMessage(
      `coc-pilot is not authenticated, run 'coc-pilot.signIn'!`
    );
  }

  const currentDocument = await workspace.document;
  if (currentDocument) {
    sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: currentDocument.uri,
        languageId: currentDocument.languageId,
        version: currentDocument.version,
        text: currentDocument.textDocument.getText(),
      },
    });
  }

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

    createCursorEventHandler("CursorHoldI"),
    createCursorEventHandler("CursorHold"),

    languages.registerCompletionItemProvider("copilot", "COP", null, {
      provideCompletionItems: async (
        document,
        position
      ): Promise<CompletionItem[]> => {
        if (
          state.lastPosition.line === position.line &&
          state.lastPosition.character === position.character &&
          state.lastDocument.uri === document.uri &&
          state.lastDocument.version === document.version
        ) {
          return state.lastResults;
        }

        const result = (await sendRequest("textDocument/inlineCompletion", {
          version: document.version,
          position,
          textDocument: { uri: document.uri },
          context: { triggerKind: CompletionTriggerKind.Invoked },
        })) as { items: CopilotInlineCompletionItem[] };
        const items = transformResultsToCompletions(result.items);

        // window.showInformationMessage("results: " + JSON.stringify(items));

        state.lastResults = items;
        state.lastPosition = {
          line: position.line,
          character: position.character,
        };
        state.lastDocument = {
          uri: document.uri,
          version: document.version,
        };

        return items;
      },
    }),

    commands.registerCommand("coc-pilot.signIn", async () => {
      const status = await sendRequest("checkStatus", {});
      if ("user" in status) {
        window.showInformationMessage(
          "coc-pilot is already signed in as: " + status.user
        );
        return;
      }

      const data = (await sendRequest("signInInitiate", {})) as {
        verificationUri: string;
        userCode: string;
      };

      await window.showDialog({
        content: `Open ${data.verificationUri} in the browser and authenticate with \`${data.userCode}\` one-time code, confirm here once ready.`,
        buttons: [
          { index: 0, text: "Authenticated in the browser" },
          { index: 1, text: "Cancel" },
        ],
        callback: async (idx) => {
          if (idx === 1) {
            return;
          }
          window.showInformationMessage("coc-pilot checking sign in status...");
          const request = (await sendRequest("signInConfirm", {
            userCode: data.userCode,
          })) as {
            status: string;
            error: string;
          };

          if (request.status === "error") {
            window.showErrorMessage(
              "coc-pilot sign in failed: " + request.error
            );
            return;
          }

          const status = (await sendRequest("checkStatus", {})) as {
            user: string;
          };

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

  function createCursorEventHandler(eventName: MoveEvents) {
    return events.on(eventName, async (bufnr, cursor) => {
      const document = workspace.getDocument(bufnr);
      const position = { line: cursor[0] - 1, character: cursor[1] - 1 };

      if (
        state.lastPosition.line === position.line &&
        state.lastPosition.character === position.character &&
        state.lastDocument.uri === document.uri &&
        state.lastDocument.version === document.version
      ) {
        return;
      }

      const result = (await sendRequest("textDocument/inlineCompletion", {
        version: document.version,
        position,
        textDocument: { uri: document.uri },
        context: { triggerKind: CompletionTriggerKind.Invoked },
      })) as { items: CopilotInlineCompletionItem[] };

      state.lastResults = result.items;
      state.lastPosition = {
        line: position.line,
        character: position.character,
      };
      state.lastDocument = {
        uri: document.uri,
        version: document.version,
      };
    });
  }

  function transformResultsToCompletions(
    items: CopilotInlineCompletionItem[]
  ): CompletionItem[] {
    return items.map((item) => ({
      sortText: "   " + item.insertText,
      label: item.insertText!.split("\n")[0],
      detail: item.insertText!.includes("\n") ? item.insertText : undefined,
      kind: CompletionItemKind.Snippet,
      textEdit: {
        range: item.range,
        newText: item.insertText,
      },
    }));
  }
}
