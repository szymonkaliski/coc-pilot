import {
  ExtensionContext,
  workspace,
  languages,
  CompletionItem,
  CompletionItemKind,
  CompletionTriggerKind,
} from "coc.nvim";
import { sendNotification, sendRequest } from "./copilot";

export async function activate(context: ExtensionContext): Promise<void> {
  await sendRequest("initialize", {
    capabilities: { workspace: { workspaceFolders: true } },
  });

  sendNotification("initialized", {});

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
            // hack to sort on top of the list
            sortText: " " + c.insertText,
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
    })

    // TODO: sign-in flow using a command
    // commands.registerCommand('coc-pilot.Command', async () => {
    //   window.showInformationMessage('coc-pilot Commands works!');
    // }),
  );
}
