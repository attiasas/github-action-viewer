# Contributing to GitHub Actions Viewer

```
github-action-viewer/
├── src/                   # Frontend React application
│   ├── components/        # Reusable React components
│   ├── contexts/          # React contexts (Auth)
│   ├── pages/             # Page components
│   └── App.tsx            # Main application component
├── server/                # Backend Node.js application
│   ├── routes/            # API route handlers
│   ├── database.js        # Database setup and connection
│   └── index.js           # Main server file
└── public/                # Static assets
```

Thank you for your interest in contributing! We welcome all kinds of contributions—bug reports, feature requests, code, and documentation.

## How to Contribute

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes** (add tests if possible)
4. **Run tests and lint**
5. **Submit a pull request**

## Development Setup

- Clone the repo and install dependencies:
  ```bash
  git clone https://github.com/attiasas/github-action-viewer.git
  cd github-action-viewer
  npm install
  ```
- Start the backend:
  ```bash
  npm run dev:server
  ```
- In another terminal, start the frontend:
  ```bash
  npm run dev
  ```
- Or start both at once:
  ```bash
  npm run dev:both
  ```

## Coding Standards

- Use TypeScript for frontend code
- Use ESLint (`npm run lint`) before submitting
- Write clear commit messages
- Add or update tests for new features or bugfixes

## Reporting Issues

- Use [GitHub Issues](https://github.com/attiasas/github-action-viewer/issues)
- Include steps to reproduce, expected and actual behavior, and screenshots if possible

---

Thank you for helping make GitHub Actions Viewer better!
