import * as vscode from "vscode";
import * as http from "http";
import * as https from "https";

let chatSidebarProvider: ChatSidebarProvider;

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("Helia Chat Sidebar Activated!");

  chatSidebarProvider = new ChatSidebarProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("heliaChatView", chatSidebarProvider)
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
              "codellama:7b",
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

  // Ensure the webview updates correctly when adding or deleting chats
  context.subscriptions.push(
    vscode.commands.registerCommand("heliaChat.newChat", async () => {
      const chatProvider = getChatProvider();
      const id = chatProvider.generateId();
      chatProvider.chats.push({
        id,
        name: `Chat ${chatProvider.chats.length + 1}`,
        history: [],
      });
      chatProvider.activeChatId = id;
      chatProvider.saveChats();
      chatProvider.updateWebview(); // Ensure the webview reflects the new chat
    })
  );

  // Update the delete chat command to not auto-create a new chat when all chats are deleted
  context.subscriptions.push(
    vscode.commands.registerCommand("heliaChat.deleteChat", async () => {
      const chatProvider = getChatProvider();

      // Find the active chat
      const activeChatIndex = chatProvider.chats.findIndex(
        (chat) => chat.id === chatProvider.activeChatId
      );

      if (activeChatIndex !== -1) {
        // Remove the active chat and its history
        chatProvider.chats.splice(activeChatIndex, 1);

        // If no chats remain, clear the activeChatId
        if (chatProvider.chats.length === 0) {
          chatProvider.activeChatId = "";
        } else {
          // Otherwise, set the active chat to the first one
          chatProvider.activeChatId = chatProvider.chats[0].id;
        }

        chatProvider.saveChats();
        chatProvider.updateWebview(); // Update the webview to reflect the deleted chat
      }
    })
  );

  // Ensure the webview updates correctly when switching chats
  context.subscriptions.push(
    vscode.commands.registerCommand("heliaChat.showHistory", async () => {
      const chatProvider = getChatProvider();
      const items = chatProvider.chats.map((chat: { id: string; name: string }) => ({
        label: chat.name,
        id: chat.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a chat",
      }) as { label: string; id: string } | undefined;

      if (selected) {
        chatProvider.activeChatId = selected.id;
        chatProvider.saveChats();
        chatProvider.updateWebview(); // Ensure the webview reflects the active chat
      }
    })
  );
}

export function deactivate() {}

class ChatSidebarProvider implements vscode.WebviewViewProvider {
  // Change protected properties to public for external access
  public chats: {
    id: string;
    name: string;
    history: { role: string; content: string }[];
  }[] = [];
  public activeChatId: string = "";

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

  // Change private methods to public for external access
  public saveChats() {
    if (this._context) {
      this._context.globalState.update("heliaChats", {
        chats: this.chats,
        activeChatId: this.activeChatId,
      });
    }
  }

  public generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  // Update the HTML to match the provided UI design while preserving functionality
  private getHtml(): string {
    const activeChat = this.chats.find((c) => c.id === this.activeChatId);
    const chatHistory = (activeChat?.history || [])
        .map(
            (msg) =>
                `<div class="message ${msg.role === "user" ? "user" : "bot"}">${msg.content}</div>`
        )
        .join("");

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Chatbot Interface</title>
    <style>
      * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      }

      html, body {
      height: 100%;
      }

      body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #cccccc;
      height: 100vh;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: transparent;
      }

      .chat-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
      height: 100vh;
      min-height: 0;
      }

      .chat-messages {
      flex: 1 1 0%;
      overflow-y: auto;
      padding: 20px 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      scrollbar-width: thin;
      scrollbar-color: #44444400 #00000000;
      }

      .chat-messages::-webkit-scrollbar {
      width: 6px;
      background: transparent;
      }
      .chat-messages::-webkit-scrollbar-thumb {
      background: #444444;
      border-radius: 3px;
      }
      .chat-messages::-webkit-scrollbar-track {
      background: transparent;
      }

      .input-container {
      background-color: #2d2d30;
      border: 1px solid #3e3e42;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 0;
      margin-top: 0;
      position: sticky;
      bottom: 0;
      z-index: 2;
      }

      .input-row {
      display: flex;
      align-items: center;
      gap: 12px;
      justify-content: space-between;
      }

      .model-selector {
      position: relative;
      display: inline-block;
      }

      .model-dropdown {
      background-color: #1e1e1e;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      padding: 6px 10px;
      color: #cccccc;
      font-size: 12px;
      cursor: pointer;
      appearance: none;
      outline: none;
      max-width: min-content;
      background-image: none;
      }

      .model-dropdown:focus {
      border-color: #3e3e42 !important;
      box-shadow: none !important;
      outline: none !important;
      }

      .message-input {
      width: 100%;
      background: transparent;
      border: none;
      color: #cccccc;
      font-size: 14px;
      outline: none;
      resize: none;
      min-height: 20px;
      max-height: 120px;
      font-family: inherit;
      }

      .message-input:focus {
      outline: none !important;
      border: none !important;
      box-shadow: none !important;
      }
      .message-input::placeholder {
      color: #6a6a6a;
      }

      .input-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      }

      .icon-button {
      background: none;
      border: none;
      color: #cccccc;
      cursor: pointer;
      padding: 6px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
      }

      .icon-button:hover {
      background-color: #3e3e42;
      }

      .icon-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      }

      .send-button {
      background-color: #0078d4;
      color: white;
      }

      .send-button:hover:not(:disabled) {
      background-color: #106ebe;
      }

      .message {
      padding: 12px 16px;
      border-radius: 8px;
      max-width: 80%;
      word-wrap: break-word;
      }

      .message.user {
      background: linear-gradient(90deg,rgb(32, 42, 56) 0%,rgb(32, 42, 56) 100%);
      color: #e6e6e6;
      align-self: flex-end;
      box-shadow: 0 2px 8px 0 #00000033;
      }

      .message.bot {
      background: none;
      border: none;
      color: #cccccc;
      align-self: flex-start;
      }

      .typing-indicator {
      display: none;
      padding: 12px 16px;
      background-color: #2d2d30;
      border: 1px solid #3e3e42;
      border-radius: 8px;
      max-width: 80%;
      align-self: flex-start;
      }

      .typing-dots {
      display: flex;
      gap: 4px;
      }

      .typing-dots span {
      width: 6px;
      height: 6px;
      background-color: #cccccc;
      border-radius: 50%;
      animation: typing 1.4s infinite ease-in-out;
      }

      .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
      .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

      @keyframes typing {
      0%, 80%, 100% { opacity: 0.3; }
      40% { opacity: 1; }
      }

      .welcome-message {
      text-align: center;
      color: #6a6a6a;
      margin: 40px 0;
      }

      .welcome-message h2 {
      color: #cccccc;
      margin-bottom: 8px;
      }
    </style>
    </head>
    <body>
    <div class="chat-container">

      <div class="chat-messages" id="chatMessages">
      ${chatHistory || `<div class="welcome-message">
      <h2>AI Assistant</h2>
      <p>Start a conversation by typing your message below</p>
      </div>`}
      </div>

      <div class="typing-indicator" id="typingIndicator">
      <div class="typing-dots">
      <span></span>
      <span></span>
      <span></span>
      </div>
      </div>
      
      <div class="input-container">
      <textarea 
      class="message-input" 
      id="messageInput" 
      placeholder="Type your message here..."
      rows="1"
      ></textarea>
      <div class="input-row">
      <div class="model-selector" id="modelSelector">
      <select id="modelDropdown" style="background:transparent;border:none;color:#cccccc;font-size:12px;outline:none;">
      </select>
      </div>
      <div class="input-actions">
      <button class="icon-button send-button" id="sendButton" title="Send message">
      ➤
      </button>
      </div>
      </div>
      </div>
    </div>

    <script>
      const vscode = acquireVsCodeApi();

      document.getElementById("sendButton").addEventListener("click", send);

      document.getElementById("messageInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
      });

      function send() {
      const input = document.getElementById("messageInput");
      const text = input.value.trim();
      if (!text) return;

      // Append user message to chat
      const chatDiv = document.getElementById("chatMessages");
      const userBubble = document.createElement("div");
      userBubble.className = "message user";
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
        const chatDiv = document.getElementById("chatMessages");

        if (message.stream) {
        if (!streamingBubble) {
          streamingBubble = document.createElement("div");
          streamingBubble.className = "message bot";
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
      } else if (message.command === "models") {
        const modelDropdown = document.getElementById("modelDropdown");
        modelDropdown.innerHTML = "";
        message.models.forEach((model) => {
          const option = document.createElement("option");
          option.value = model;
          option.textContent = model;
          modelDropdown.appendChild(option);
        });
      }
      });
    </script>
    </body>
    </html>`;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this.getHtml();

    // Send models to webview on load
    fetchOllamaModels().then((models) => {
      webviewView.webview.postMessage({ command: "models", models });
    });

    const updateTitle = () => {
      const activeChat = this.chats.find((c) => c.id === this.activeChatId);
      webviewView.title = activeChat ? `${activeChat.name}` : "";
    };

    updateTitle(); // Set initial title

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
            updateTitle(); // Update title dynamically
            webviewView.webview.html = this.getHtml();
          } else {
            this.activeChatId = selected.id;
            this.saveChats();
            updateTitle(); // Update title dynamically
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
        updateTitle(); // Update title dynamically
        webviewView.webview.html = this.getHtml();
      } else if (message.command === "ask") {
        const chat = this.chats.find((c) => c.id === this.activeChatId);
        if (!chat) {
          return;
        }
        const selectedModel = message.model || "codellama:7b";

        chat.history.push({ role: "user", content: message.text });
        let fullReply = "";
        await streamOllamaWithHistory(chat.history, selectedModel, (token: string, isDone: boolean) => {
          if (token) {
            fullReply += token;
          }
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
  private _webviewView?: vscode.WebviewView;

  // Ensure the webview updates correctly when switching chats
  public updateWebview() {
    if (this._webviewView) {
      var activeChat = this.chats.find((c) => c.id === this.activeChatId);
      // If the active chat is undefined (e.g., after deletion), create a new chat
      if (!activeChat) {
        const id = this.generateId();
        activeChat = { id, name: `Chat ${this.chats.length + 1}`, history: [] };
        this.chats.push(activeChat);
        this.activeChatId = id;
        this.saveChats();
      }
      this._webviewView.title = activeChat ? `${activeChat.name}` : "";
      this._webviewView.webview.html = '';
      this._webviewView.webview.html = this.getHtml();
    }
  }
}

// Add a command to fetch Ollama models and send to webview
async function fetchOllamaModels(): Promise<string[]> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 11434,
        path: "/api/tags",
        method: "GET",
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const models = (json.models || []).map((m: any) => m.name || m.model);
            resolve(models);
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on("error", () => resolve([]));
    req.end();
  });
}

export function getChatProvider(): ChatSidebarProvider {
  return chatSidebarProvider;
}

// Fix the `streamOllamaWithHistory` function to accept the model parameter
function streamOllamaWithHistory(
  history: { role: string; content: string }[],
  model: string,
  onToken: (token: string, done: boolean) => void
) {
  const prompt =
    history
      .map((h) => (h.role === "user" ? "User: " : "Helia: ") + h.content)
      .join("\n") + "\nHelia:";
  const data = JSON.stringify({ model, prompt, stream: true });
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
      let finalMessageSent = false;
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
              finalMessageSent = true;
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
