# Contributing to QHTTPX

First off, thank you for considering contributing to QHTTPX! It's people like you that make QHTTPX such a great tool.

## 🛠️ Development Setup

QHTTPX is a hybrid framework using **TypeScript** (Node.js) and **Rust** (Core). To contribute, you'll need both environments set up.

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Rust**: Latest stable version (install via [rustup](https://rustup.rs/))
- **Build Tools**: You may need C++ build tools for your platform (e.g., Visual Studio Build Tools on Windows, `build-essential` on Linux).

### Initial Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Quantam-Open-Source/qhttpx.git
    cd qhttpx
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Build the Core (Rust)**
    This compiles the Rust backend and generates the N-API bindings.
    ```bash
    npm run build:core
    ```

4.  **Build the Project**
    ```bash
    npm run build
    ```

## 🧪 Running Tests

We use `vitest` for testing.

```bash
# Run all tests
npm test

# Run specific test file
npm test src/test.ts
```

## 📐 Coding Standards

- **TypeScript**: We follow strict typing. Ensure no `any` usage unless absolutely necessary.
- **Rust**: Follow idiomatic Rust patterns (Clippy is your friend).
- **Linting**: Run `npm run lint` before committing.

## 📝 Pull Request Process

1.  Fork the repo and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  If you've changed APIs, update the documentation.
4.  Ensure the test suite passes (`npm test`).
5.  Make sure your code lints (`npm run lint`).
6.  Issue that pull request!

## 🐛 Reporting Bugs

Bugs are tracked as GitHub issues. When filing an issue, please include:
- The version of QHTTPX you are using.
- Your OS and Node.js version.
- A minimal reproduction snippet.

## 💡 Feature Requests

We welcome feature requests! Please file an issue with the label `enhancement` and describe what you want to see and why.

Thank you for contributing!
