#!/bin/bash

# GitHub Actions Viewer Build Script
# This script creates a portable binary for the GitHub Actions Viewer application

set -e  # Exit on any error

echo "🚀 GitHub Actions Viewer Build Script"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="github-action-viewer"
BUILD_DIR="build"
DIST_DIR="dist"
VERSION="1.0.0"

# Detect platform
PLATFORM=$(uname -s)
ARCH=$(uname -m)

case $PLATFORM in
    Darwin)
        PLATFORM_NAME="macos"
        ;;
    Linux)
        PLATFORM_NAME="linux"
        ;;
    CYGWIN*|MINGW*|MSYS*)
        PLATFORM_NAME="windows"
        ;;
    *)
        echo -e "${RED}❌ Unsupported platform: $PLATFORM${NC}"
        exit 1
        ;;
esac

case $ARCH in
    x86_64|amd64)
        ARCH_NAME="x64"
        ;;
    arm64|aarch64)
        ARCH_NAME="arm64"
        ;;
    *)
        echo -e "${RED}❌ Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

BUILD_NAME="${APP_NAME}-${VERSION}-${PLATFORM_NAME}-${ARCH_NAME}"
BINARY_NAME="${APP_NAME}"

if [ "$PLATFORM_NAME" = "windows" ]; then
    BINARY_NAME="${BINARY_NAME}.exe"
fi

echo -e "${BLUE}📦 Building for: ${PLATFORM_NAME}-${ARCH_NAME}${NC}"
echo -e "${BLUE}📁 Build directory: ${BUILD_DIR}/${BUILD_NAME}${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check required tools
echo -e "${YELLOW}🔍 Checking dependencies...${NC}"

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is required but not installed${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}❌ npm is required but not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All dependencies found${NC}"

# Clean previous builds
echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
rm -rf $BUILD_DIR
rm -rf $DIST_DIR
mkdir -p $BUILD_DIR

# Install dependencies
echo -e "${YELLOW}📥 Installing dependencies...${NC}"
npm install

# Build frontend
echo -e "${YELLOW}🏗️  Building frontend...${NC}"
npm run build

# Create build directory structure
BUILD_PATH="$BUILD_DIR/$BUILD_NAME"
mkdir -p "$BUILD_PATH"

# Copy built frontend
echo -e "${YELLOW}📂 Copying frontend build...${NC}"
cp -r dist "$BUILD_PATH/"

# Copy server files
echo -e "${YELLOW}📂 Copying server files...${NC}"
cp -r server "$BUILD_PATH/"

# Copy package.json (only production dependencies)
echo -e "${YELLOW}📄 Preparing package.json...${NC}"
cat > "$BUILD_PATH/package.json" << EOF
{
  "name": "$APP_NAME",
  "version": "$VERSION",
  "type": "module",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "sqlite3": "^5.1.7",
    "bcrypt": "^6.0.0",
    "axios": "^1.10.0",
    "dotenv": "^17.1.0"
  }
}
EOF

# Install production dependencies
echo -e "${YELLOW}📦 Installing production dependencies...${NC}"
cd "$BUILD_PATH"
npm install --production
cd - > /dev/null

# Create startup script
echo -e "${YELLOW}📝 Creating startup script...${NC}"
cat > "$BUILD_PATH/start.sh" << 'EOF'
#!/bin/bash

# GitHub Actions Viewer Startup Script
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PORT=3000
APP_NAME="GitHub Actions Viewer"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}🚀 Starting ${APP_NAME}...${NC}"

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port $PORT is already in use. Trying to find an available port...${NC}"
    
    # Find available port starting from 3001
    for port in {3001..3010}; do
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            PORT=$port
            break
        fi
    done
    
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ Could not find an available port${NC}"
        exit 1
    fi
fi

# Set environment variables
export NODE_ENV=production
export PORT=$PORT

# Start the application
echo -e "${GREEN}✅ Starting server on port $PORT...${NC}"
echo -e "${BLUE}🌐 Open your browser and navigate to: http://localhost:$PORT${NC}"
echo -e "${YELLOW}💡 Press Ctrl+C to stop the server${NC}"
echo ""

# Function to open browser (cross-platform)
open_browser() {
    local url="http://localhost:$PORT"
    
    # Wait a moment for server to start
    sleep 2
    
    case "$(uname -s)" in
        Darwin)
            open "$url"
            ;;
        Linux)
            if command -v xdg-open > /dev/null; then
                xdg-open "$url"
            elif command -v gnome-open > /dev/null; then
                gnome-open "$url"
            fi
            ;;
        CYGWIN*|MINGW*|MSYS*)
            start "$url"
            ;;
    esac
}

# Open browser in background
open_browser &

# Start the Node.js server
node server/index.js
EOF

# Make startup script executable
chmod +x "$BUILD_PATH/start.sh"

# Create Windows batch file
cat > "$BUILD_PATH/start.bat" << 'EOF'
@echo off
setlocal EnableDelayedExpansion

REM GitHub Actions Viewer Startup Script for Windows
title GitHub Actions Viewer

REM Configuration
set PORT=3000
set APP_NAME=GitHub Actions Viewer

REM Get script directory
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo 🚀 Starting %APP_NAME%...

REM Check if port is already in use
netstat -an | find ":!PORT! " | find "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo ⚠️  Port !PORT! is already in use. Trying to find an available port...
    
    REM Find available port starting from 3001
    for /l %%i in (3001,1,3010) do (
        netstat -an | find ":%%i " | find "LISTENING" >nul 2>&1
        if !errorlevel! neq 0 (
            set PORT=%%i
            goto :found_port
        )
    )
    
    echo ❌ Could not find an available port
    pause
    exit /b 1
)

:found_port
REM Set environment variables
set NODE_ENV=production
set PORT=%PORT%

REM Start the application
echo ✅ Starting server on port %PORT%...
echo 🌐 Open your browser and navigate to: http://localhost:%PORT%
echo 💡 Press Ctrl+C to stop the server
echo.

REM Open browser after a short delay
timeout /t 2 /nobreak >nul 2>&1
start http://localhost:%PORT%

REM Start the Node.js server
node server/index.js

pause
EOF

# Create README for the build
cat > "$BUILD_PATH/README.md" << EOF
# GitHub Actions Viewer - Portable Distribution

Version: $VERSION
Platform: $PLATFORM_NAME-$ARCH_NAME

## Quick Start

### macOS/Linux:
\`\`\`bash
./start.sh
\`\`\`

### Windows:
\`\`\`cmd
start.bat
\`\`\`

The application will automatically:
1. Start the server on port 3000 (or find an available port)
2. Open your default browser to http://localhost:3000
3. Display the GitHub Actions Viewer interface

## Data Storage

Your data is stored in your user directory:
- **macOS**: ~/Library/Application Support/GitHubActionViewer/
- **Linux**: ~/.local/share/GitHubActionViewer/
- **Windows**: %LOCALAPPDATA%\\GitHubActionViewer\\

This ensures your data persists between application runs and updates.

## Manual Start

If you prefer to start the application manually:

\`\`\`bash
export NODE_ENV=production
export PORT=3000
node server/index.js
\`\`\`

Then open http://localhost:3000 in your browser.

## System Requirements

- Node.js 18 or higher
- 512MB RAM minimum
- 100MB disk space
- Modern web browser (Chrome, Firefox, Safari, Edge)

## Support

For issues and support, please visit the project repository.
EOF

# Create archive
echo -e "${YELLOW}📦 Creating archive...${NC}"
cd $BUILD_DIR
tar -czf "${BUILD_NAME}.tar.gz" "$BUILD_NAME"
cd - > /dev/null

# Create final executable script (Unix-like systems)
if [ "$PLATFORM_NAME" != "windows" ]; then
    echo -e "${YELLOW}🔧 Creating portable executable...${NC}"
    
    cat > "$BUILD_DIR/$BINARY_NAME" << 'EOF'
#!/bin/bash

# GitHub Actions Viewer Portable Executable
# This script extracts and runs the application

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="$(mktemp -d)"
APP_DIR="$TEMP_DIR/github-action-viewer"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 GitHub Actions Viewer${NC}"
echo -e "${BLUE}========================${NC}"

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js is required but not installed${NC}"
    echo -e "${YELLOW}Please install Node.js from https://nodejs.org${NC}"
    exit 1
fi

# Cleanup function
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Extract embedded archive
echo -e "${YELLOW}📦 Extracting application...${NC}"
ARCHIVE_START=$(awk '/^__ARCHIVE_START__$/{print NR + 1; exit 0; }' "$0")
tail -n +$ARCHIVE_START "$0" | tar -xzf - -C "$TEMP_DIR"

# Find the extracted directory
EXTRACTED_DIR=$(find "$TEMP_DIR" -name "github-action-viewer-*" -type d | head -n 1)
if [ -z "$EXTRACTED_DIR" ]; then
    echo -e "${RED}❌ Failed to extract application${NC}"
    exit 1
fi

# Run the application
echo -e "${GREEN}✅ Starting application...${NC}"
cd "$EXTRACTED_DIR"
exec ./start.sh

exit 0
__ARCHIVE_START__
EOF

    # Append the archive to the script
    cat "$BUILD_DIR/${BUILD_NAME}.tar.gz" >> "$BUILD_DIR/$BINARY_NAME"
    chmod +x "$BUILD_DIR/$BINARY_NAME"
fi

# Final output
echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo ""
echo -e "${BLUE}📁 Build artifacts:${NC}"
echo "   - Directory: $BUILD_DIR/$BUILD_NAME/"
echo "   - Archive: $BUILD_DIR/${BUILD_NAME}.tar.gz"
if [ "$PLATFORM_NAME" != "windows" ]; then
    echo "   - Portable executable: $BUILD_DIR/$BINARY_NAME"
fi
echo ""
echo -e "${BLUE}🚀 To run the application:${NC}"
if [ "$PLATFORM_NAME" != "windows" ]; then
    echo "   Portable: ./$BUILD_DIR/$BINARY_NAME"
fi
echo "   From archive: Extract and run start.sh (Unix) or start.bat (Windows)"
echo ""
echo -e "${YELLOW}💡 The application will store data in your user directory${NC}"
echo -e "${YELLOW}   so your data persists between runs.${NC}"
