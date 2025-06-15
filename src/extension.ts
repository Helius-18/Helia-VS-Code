import * as vscode from "vscode";
import * as http from "http";
import * as https from "https";

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("Helia Chat Sidebar Activated!");
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "heliaChatView",
      new ChatSidebarProvider(context.extensionUri)
    )
  );

  // Register the quick ask command if needed
  const quickAskCommand = vscode.commands.registerCommand(
    "heliaChat.askQuestion",
    async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Ask Helia a question:",
      });
      if (input) {
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Querying Helia...",
            cancellable: false,
          },
          async () => {
            let fullReply = "";
            await streamOllamaWithHistory(
              [{ role: "user", content: input }],
              (token, isDone) => {
                if (token) {
                  fullReply += token;
                }
              }
            );
            vscode.window.showInformationMessage(fullReply);
          }
        );
      }
    }
  );
  context.subscriptions.push(quickAskCommand);
}

export function deactivate() {}

class ChatSidebarProvider implements vscode.WebviewViewProvider {
  private chats: {
    id: string;
    name: string;
    history: { role: string; content: string }[];
  }[] = [];
  private activeChatId: string = "";
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context?: vscode.ExtensionContext
  ) {
    if (_context) {
      const saved = _context.globalState.get<any>("heliaChats");
      if (saved) {
        this.chats = saved.chats || [];
        this.activeChatId = saved.activeChatId || (this.chats[0]?.id ?? "");
      }
    }
    if (this.chats.length === 0) {
      const id = this.generateId();
      this.chats.push({ id, name: "Chat 1", history: [] });
      this.activeChatId = id;
    }
  }

  private saveChats() {
    if (this._context) {
      this._context.globalState.update("heliaChats", {
        chats: this.chats,
        activeChatId: this.activeChatId,
      });
    }
  }

  private generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  private getHtml(): string {
    const activeChat = this.chats.find((c) => c.id === this.activeChatId);
    const chatHistory = (activeChat?.history || [])
      .map(
        (msg) =>
          `<div class="bubble ${msg.role === "user" ? "user" : "bot"}">${msg.content}</div>`
      )
      .join("");

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body {
                    padding: 0;
                    margin: 0;
                    height: 100%;
                    background: var(--vscode-sideBar-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
                    display: flex;
                    flex-direction: column;
                }

                .top-bar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 8px;
                    height: 44px;
                    background: var(--vscode-sideBar-background);
                    border-bottom: 1px solid var(--vscode-editorWidget-border);
                }

                .top-bar-title {
                    font-size: 1em;
                    font-weight: bold;
                    color: var(--vscode-editor-foreground);
                }

                .top-bar-buttons {
                    display: flex;
                    gap: 8px;
                }

                .icon-btn {
                    width: 32px;
                    height: 32px;
                    font-size: 20px;
                    background: none;
                    border: none;
                    color: var(--vscode-button-background);
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .icon-btn:hover {
                    background: var(--vscode-editorWidget-background);
                }

                #chat {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .bubble {
                    padding: 10px 14px;
                    border-radius: 12px;
                    max-width: 80%;
                    word-wrap: break-word;
                    font-size: 0.95em;
                }

                .user {
                    align-self: flex-end;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-bottom-right-radius: 2px;
                }

                .bot {
                    align-self: flex-start;
                    background: var(--vscode-editorWidget-background);
                    color: var(--vscode-editorWidget-foreground);
                    border-bottom-left-radius: 2px;
                }

                .input-container {
                    border-top: 1px solid var(--vscode-editorWidget-border);
                    background: var(--vscode-sideBar-background);
                    padding: 12px 14px;
                    display: flex;
                    align-items: flex-end;
                    gap: 8px;
                }

                #input {
                    flex: 1;
                    resize: vertical;
                    min-height: 36px;
                    max-height: 120px;
                    padding: 8px 10px;
                    border-radius: 6px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-size: 0.95em;
                    outline: none;
                }

                #input:focus {
                    border: 1.5px solid var(--vscode-focusBorder);
                }

                #sendBtn {
                    min-width: 40px;
                    height: 36px;
                    border-radius: 6px;
                    border: none;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: background 0.2s ease;
                }

                #sendBtn:hover {
                    background: var(--vscode-button-hoverBackground);
                }

                #sendBtn svg {
                    width: 20px;
                    height: 20px;
                }
            </style>
        </head>
        <body>
            <div class="top-bar">
                <div class="top-bar-title">Helia : ${activeChat?.name || "Chat"}</div>
                <div class="top-bar-buttons">
                    <button class="icon-btn" id="newChatBtn" title="New Chat">＋</button>
                    <button class="icon-btn" id="chatHistoryBtn" title="Chat History">⏳</button>
                </div>
            </div>

            <div id="chat">${chatHistory}</div>

            <div class="input-container">
                <textarea id="input" rows="1" placeholder="Ask something..."></textarea>
                <button id="sendBtn" title="Send">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.94 2.94a1.5 1.5 0 0 1 1.6-.33l12.5 5.1a1.5 1.5 0 0 1 0 2.78l-12.5 5.1a1.5 1.5 0 0 1-2.06-1.6l.7-3.5a.5.5 0 0 1 .49-.4h7.13a.5.5 0 0 0 0-1H3.17a.5.5 0 0 1-.49-.4l-.7-3.5a1.5 1.5 0 0 1 .96-1.65z" />
                    </svg>
                </button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                document.getElementById("chatHistoryBtn").addEventListener("click", () => {
                    vscode.postMessage({ command: "showChatPicker" });
                });

                document.getElementById("newChatBtn").addEventListener("click", () => {
                    vscode.postMessage({ command: "newChat" });
                });

                document.getElementById("sendBtn").addEventListener("click", send);

                document.getElementById("input").addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                    }
                });

                function send() {
                    const input = document.getElementById("input");
                    const text = input.value.trim();
                    if (!text) return;

                    // Append user message to chat
                    const chatDiv = document.getElementById("chat");
                    const userBubble = document.createElement("div");
                    userBubble.className = "bubble user";
                    userBubble.textContent = text;
                    chatDiv.appendChild(userBubble);
                    chatDiv.scrollTop = chatDiv.scrollHeight;

                    vscode.postMessage({ command: "ask", text });
                    input.value = "";
                    input.focus();
                }

                let streamingBubble = null;

                window.addEventListener("message", (event) => {
                    const message = event.data;
                    if (message.text) {
                        const chatDiv = document.getElementById("chat");

                        if (message.stream) {
                            if (!streamingBubble) {
                                streamingBubble = document.createElement("div");
                                streamingBubble.className = "bubble bot";
                                chatDiv.appendChild(streamingBubble);
                            }
                            streamingBubble.textContent = message.text;
                        } else {
                            if (streamingBubble) {
                                streamingBubble.textContent = message.text;
                                streamingBubble = null; // Finalize the streaming bubble
                            }
                        }

                        chatDiv.scrollTop = chatDiv.scrollHeight;
                    }
                });

            </script>
        </body>
        </html>
        `;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "showChatPicker") {
        const items = this.chats.map((chat) => ({
          label: chat.name,
          id: chat.id,
        }));
        items.push({ label: "＋ New Chat", id: "new" });

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "Select a chat or create a new one",
        });

        if (selected) {
          if (selected.id === "new") {
            const id = this.generateId();
            this.chats.push({
              id,
              name: `Chat ${this.chats.length + 1}`,
              history: [],
            });
            this.activeChatId = id;
            this.saveChats();
            webviewView.webview.html = this.getHtml();
          } else {
            this.activeChatId = selected.id;
            this.saveChats();
            webviewView.webview.html = this.getHtml();
          }
        }
      } else if (message.command === "newChat") {
        const id = this.generateId();
        this.chats.push({
          id,
          name: `Chat ${this.chats.length + 1}`,
          history: [],
        });
        this.activeChatId = id;
        this.saveChats();
        webviewView.webview.html = this.getHtml();
      } else if (message.command === "ask") {
        const chat = this.chats.find((c) => c.id === this.activeChatId);
        if (!chat) {
          return;
        }
        chat.history.push({ role: "user", content: message.text });
        let fullReply = "";
        await streamOllamaWithHistory(chat.history, (token, isDone) => {
          if (token) {
            fullReply += token;
          }
          // Ensure updates are sent only to the active chat
          if (this.activeChatId === chat.id) {
            webviewView.webview.postMessage({ text: fullReply, stream: !isDone });
          }
          if (isDone && fullReply.trim()) {
            chat.history.push({ role: "assistant", content: fullReply });
            this.saveChats();
          }
        });
      }
    });
  }
}

function streamOllamaWithHistory(
  history: { role: string; content: string }[],
  onToken: (token: string, done: boolean) => void
) {
  // Format the conversation as a prompt string
  const prompt =
    history
      .map((h) => (h.role === "user" ? "User: " : "Helia: ") + h.content)
      .join("\n") + "\nHelia:";
  const data = JSON.stringify({ model: "codellama:7b", prompt, stream: true });
  const req = http.request(
    {
      hostname: "localhost",
      port: 11434,
      path: "/api/generate",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    },
    (res) => {
      let buffer = "";
      let finalMessageSent = false; // Track if the final message has been sent
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        let lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          try {
            const json = JSON.parse(line);
            if (json.response) {
              onToken(json.response, false);
            }
            if (json.done && !finalMessageSent) {
              onToken(json.response || "", true);
              finalMessageSent = true; // Ensure the final message is sent only once
              break;
            }
          } catch {}
        }
      });
      res.on("end", () => {
        if (!finalMessageSent) {
          onToken("", true);
        }
      });
    }
  );
  req.on("error", (err) => {
    onToken("Error: Could not reach Ollama.", true);
  });
  req.write(data);
  req.end();
}
