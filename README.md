# 🚀 JSHub

[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri&logoColor=white&style=flat-square)](https://tauri.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs&logoColor=white&style=flat-square)](https://nextjs.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange?logo=rust&logoColor=white&style=flat-square)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Visitors](https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fandangdj%2FJSHub&label=visitor&countColor=%2337d67a)](https://visitorbadge.io/status?path=https%3A%2F%2Fgithub.com%2Fandangdj%2FJSHub)

**JSHub** is a cross-platform desktop application designed to help web developers instantly manage, monitor, and run local JavaScript/TypeScript projects from a single interactive dashboard.

It is built with the combined power of **Rust (Tauri)** for lightweight native OS performance, and a stunning **Next.js (React/Tailwind)** frontend for an exceptional user experience.

---

## ✨ Key Features

- **🔍 Auto Project Scanner**: Automatically scans your configured base directory to identify JavaScript/TypeScript projects (based on the presence of `package.json`).
- **📦 Multi-Framework Detection**: Automatically detects framework types and versions, including **Next.js**, **NestJS**, **React**, **Vue**, **Express**, and **Node.js (Vanilla)**.
- **🔌 Smart Port Auto-Resolver**: Automatically extracts and resolves development ports from environment files (`.env`, `.env.local`, `.env.development`) or from execution arguments in your `dev` scripts.
- **🐧 WSL & Native OS Support**: Run projects natively on Windows, macOS, and Linux, or toggle integrated **WSL (Windows Subsystem for Linux)** environment support with dynamic path conversion.
- **💻 Interactive Terminal Logs**: Streams real-time `stdout` and `stderr` outputs directly into the dashboard console, complete with log filtering.
- **🌐 Quick Browser Access**: Open your project development server in your default system browser with a single click.

---

## 🛠️ Prerequisites

To run or build this project locally, ensure you have the following installed:

1. [Node.js](https://nodejs.org/) (LTS recommended)
2. [Rust Toolchain](https://www.rust-lang.org/tools/install)
3. Tauri system dependencies for your OS (See [Tauri Prerequisites Guide](https://tauri.app/v1/guides/getting-started/prerequisites/))
4. *(Optional for Windows)* [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) if you want to use the WSL integration mode.

---

## 🚀 Getting Started (Development Mode)

To run JSHub in development mode locally:

1. Clone this repository:
   ```bash
   git clone https://github.com/andangdj/JSHub.git
   cd JSHub
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the Tauri application in dev mode:
   ```bash
   npm run tauri dev
   ```

---

## 🏗️ Build Installer (Production)

To compile and build a production-ready installer for your current platform:

```bash
npm run tauri build
```

The resulting installers (`.exe` / `.msi` for Windows, `.dmg` / `.app.tar.gz` for macOS, `.deb` / `.appimage` for Linux) will be stored in:
`src-tauri/target/release/bundle/`

---

## 🛡️ License

This project is licensed under the **[MIT License](LICENSE)**.
