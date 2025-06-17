# Helia - VS Code Sidebar AI Assistant

Helia is a minimal, user-friendly AI chat assistant for Visual Studio Code. It adds a modern sidebar chat experience with support for multiple chats, model selection, and code block syntax highlighting—helping you interact with AI models directly from your editor.

---

## Features

- **Sidebar Chat Interface:** Access Helia from the VS Code sidebar as a webview panel.
- **Multiple Chats:** Create, switch, and delete independent conversations.
- **Model Selector:** Easily select from available models (e.g., local Ollama models) per chat.
- **Quick Ask:** Use the command palette to ask questions without opening the sidebar.
- **Rich Markdown & Code Blocks:** Responses support Markdown rendering, syntax highlighting, and code block copy buttons.
- **Persistent Chat History:** Conversations are saved and restored between sessions.
- **Modern UI:** The chat interface features a clean dark theme, input box, typing indicator, and convenient action buttons.

![Helia in Action](images/feature-x.png) <!-- Replace with actual screenshots -->

---

## Requirements

- **VS Code** version 1.101.0 or higher.
- **Ollama** for local AI model inference (see below for setup).
- **Node.js** and **npm** for development and building from source.

---

## Installation

### 1. Clone and Install Extension

```bash
git clone https://github.com/Helius-18/Helia-VS-Code.git
cd Helia-VS-Code
npm install
```

### 2. Compile the Extension

```bash
npm run compile
```

### 3. Launch in VS Code

- Open this folder in VS Code.
- Press `F5` to launch a new Extension Development Host window with Helia loaded.

---

## Ollama Setup (Local AI Models)

Helia requires [Ollama](https://ollama.com/) to run local AI models for chat. Follow these steps:

### 1. Install Ollama

- Visit [https://ollama.com/download](https://ollama.com/download) and download the installer for your OS.
- Install and launch Ollama. It will run as a background service.

### 2. Pull a Model (e.g., CodeLlama)

```bash
ollama pull codellama:7b
```

You can pull other models as needed. See [Ollama’s model list](https://ollama.com/library).

### 3. Verify Ollama is Running

- Execute `ollama list` to see installed models.
- Ollama should be accessible at `http://localhost:11434` (default).

---

## Usage

- **Open Helia:** Use the sidebar icon or run `Start Helia Chat` from the Command Palette.
- **New Chat:** Click the "+" button or use the command.
- **Delete Chat:** Use the trash icon or the command.
- **Model Selection:** Use the dropdown in the chat input area to select a model (all local Ollama models are listed).
- **Quick Ask:** Run `Ask Helia a Quick Question` from the Command Palette.

---

## Extension Settings

Helia currently does not require user configuration. Future updates may introduce settings for:

- Enabling/disabling the extension.
- Setting a default AI model.

---

## Commands

Access these from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Start Helia Chat`: Opens the Helia chat sidebar.
- `Ask Helia a Quick Question`: Prompts for a quick question and shows a notification with the answer.
- `New Chat`: Creates a new chat conversation.
- `Delete Chat`: Deletes the active chat.
- `Show History`: (If implemented) Shows previous conversation history.

---

## Known Issues

- Only tested with recent VS Code versions.
- Model selection assumes compatible models are available (e.g., via Ollama).
- Some advanced configuration features are under development.

---

## Release Notes

### 0.0.1

- Initial release: Sidebar chat UI, chat management, model selection, and Markdown/code block support.

---

## Contributing

Issues and pull requests are welcome! Please follow best practices for VS Code extensions:

- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

---

## Development

- Clone the repository and run `npm install`.
- Use `npm run compile` to build the extension.
- Press `F5` in VS Code to open a new window with the extension loaded.

---

**Enjoy using Helia!**
