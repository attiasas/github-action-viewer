# GitHub Actions Viewer - Build System

This document explains how to build and distribute the GitHub Actions Viewer application as a portable binary.

## Quick Build

To build the application for distribution:

```bash
./build.sh
```

Or using npm:

```bash
npm run build:binary
```

## Build Output

The build script creates several artifacts in the `build/` directory:

1. **Application Directory**: `github-action-viewer-{version}-{platform}-{arch}/`
   - Contains the complete application ready to run
   - Includes all dependencies and built frontend

2. **Archive**: `github-action-viewer-{version}-{platform}-{arch}.tar.gz`
   - Compressed archive of the application directory
   - Suitable for distribution

3. **Portable Executable**: `github-action-viewer` (Unix/Linux/macOS)
   - Self-extracting executable that contains the entire application
   - Single file that can be run anywhere

## Running the Built Application

### From the Application Directory

```bash
cd build/github-action-viewer-{version}-{platform}-{arch}/
./start.sh              # Unix/Linux/macOS
start.bat               # Windows
```

### From the Portable Executable

```bash
./build/github-action-viewer
```

### From the Archive

```bash
tar -xzf build/github-action-viewer-{version}-{platform}-{arch}.tar.gz
cd github-action-viewer-{version}-{platform}-{arch}/
./start.sh              # Unix/Linux/macOS
start.bat               # Windows
```

## Features

### Cross-Platform Support
- **macOS**: Native support with proper app data directory
- **Linux**: Follows XDG Base Directory specification
- **Windows**: Uses AppData/Local for data storage

### Data Persistence
- Database is stored in the user's local application data directory
- Data persists between application runs and updates
- No need to worry about losing data when moving the application

### Auto-Browser Opening
- Automatically opens the default browser to the application URL
- Finds available ports if default port is in use
- Shows clear instructions and links

### Self-Contained
- All Node.js dependencies included
- No need to install additional packages
- Works offline after initial setup

## Data Storage Locations

The application stores its database in platform-specific locations:

- **macOS**: `~/Library/Application Support/GitHubActionViewer/`
- **Linux**: `~/.local/share/GitHubActionViewer/`
- **Windows**: `%LOCALAPPDATA%\\GitHubActionViewer\\`

## System Requirements

- Node.js 18 or higher
- 512MB RAM minimum
- 100MB disk space
- Modern web browser

## Development vs Production

- **Development**: Database stored in `server/database.sqlite`
- **Production**: Database stored in user data directory
- Controlled by `NODE_ENV` environment variable

## Troubleshooting

### Port Already in Use
The application automatically finds an available port starting from 3000.

### Node.js Not Found
Ensure Node.js is installed and available in the system PATH.

### Permission Errors
Make sure the startup scripts have execute permissions:
```bash
chmod +x start.sh
```

### Database Issues
Check that the user has write permissions to the data directory.

## Build Script Details

The build script performs the following steps:

1. **Dependency Check**: Verifies Node.js and npm are available
2. **Clean**: Removes previous build artifacts
3. **Install**: Installs all project dependencies
4. **Build Frontend**: Compiles TypeScript and bundles the React application
5. **Copy Files**: Copies server files and built frontend to build directory
6. **Production Dependencies**: Installs only production dependencies in build directory
7. **Create Scripts**: Generates startup scripts for all platforms
8. **Archive**: Creates compressed archive
9. **Portable Executable**: Creates self-extracting executable (Unix-like systems)

## Customization

To customize the build process, modify the variables at the top of `build.sh`:

```bash
APP_NAME="github-action-viewer"
VERSION="1.0.0"
```

The script automatically detects the platform and architecture and includes them in the build name.
