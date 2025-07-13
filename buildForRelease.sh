#!/bin/bash

# GitHub Actions Viewer Build Script
# This script creates a portable binary for the GitHub Actions Viewer application

set -e  # Exit on any error

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -p, --platform PLATFORM    Target platform (macos, linux, windows)"
    echo "  -a, --arch ARCH            Target architecture (x64, arm64)"
    echo "  -v, --version VERSION      Specify version to use (default: 1.0.0)"
    echo "  -h, --help                 Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                         # Build for current platform/arch"
    echo "  $0 -p linux -a x64        # Build for Linux x64"
    echo "  $0 --platform macos --arch arm64  # Build for macOS ARM64"
    echo ""
    echo "Supported platforms: macos, linux, windows"
    echo "Supported architectures: x64, arm64"
}


# Parse command line arguments
FORCE_PLATFORM=""
FORCE_ARCH=""
FORCE_VERSION=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--platform)
            FORCE_PLATFORM="$2"
            shift 2
            ;;
        -a|--arch)
            FORCE_ARCH="$2"
            shift 2
            ;;
        -v|--version)
            FORCE_VERSION="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

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

# If version is forced, use it
if [ -n "$FORCE_VERSION" ]; then
    VERSION="$FORCE_VERSION"
    echo -e "${BLUE}🔖 Using version: $VERSION${NC}"
fi

# Detect or use forced platform
if [ -n "$FORCE_PLATFORM" ]; then
    PLATFORM_NAME="$FORCE_PLATFORM"
    echo -e "${BLUE}🎯 Using forced platform: ${PLATFORM_NAME}${NC}"
else
    PLATFORM=$(uname -s)
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
            echo -e "${YELLOW}💡 Use -p/--platform to specify: macos, linux, or windows${NC}"
            exit 1
            ;;
    esac
    echo -e "${BLUE}🔍 Detected platform: ${PLATFORM_NAME}${NC}"
fi

# Detect or use forced architecture
if [ -n "$FORCE_ARCH" ]; then
    ARCH_NAME="$FORCE_ARCH"
    echo -e "${BLUE}🎯 Using forced architecture: ${ARCH_NAME}${NC}"
else
    ARCH=$(uname -m)
    case $ARCH in
        x86_64|amd64)
            ARCH_NAME="x64"
            ;;
        arm64|aarch64)
            ARCH_NAME="arm64"
            ;;
        *)
            echo -e "${RED}❌ Unsupported architecture: $ARCH${NC}"
            echo -e "${YELLOW}💡 Use -a/--arch to specify: x64 or arm64${NC}"
            exit 1
            ;;
    esac
    echo -e "${BLUE}🔍 Detected architecture: ${ARCH_NAME}${NC}"
fi

# Validate forced inputs
if [ -n "$FORCE_PLATFORM" ]; then
    case $FORCE_PLATFORM in
        macos|linux|windows)
            ;;
        *)
            echo -e "${RED}❌ Invalid platform: $FORCE_PLATFORM${NC}"
            echo -e "${YELLOW}💡 Supported platforms: macos, linux, windows${NC}"
            exit 1
            ;;
    esac
fi

if [ -n "$FORCE_ARCH" ]; then
    case $FORCE_ARCH in
        x64|arm64)
            ;;
        *)
            echo -e "${RED}❌ Invalid architecture: $FORCE_ARCH${NC}"
            echo -e "${YELLOW}💡 Supported architectures: x64, arm64${NC}"
            exit 1
            ;;
    esac
fi

BUILD_NAME="${APP_NAME}-${VERSION}-${PLATFORM_NAME}-${ARCH_NAME}"
BINARY_NAME="${APP_NAME}-${VERSION}-${PLATFORM_NAME}-${ARCH_NAME}"

if [ "$PLATFORM_NAME" = "windows" ]; then
    BINARY_NAME="${BINARY_NAME}.exe"
fi

echo -e "${BLUE}📦 Building for: ${PLATFORM_NAME}-${ARCH_NAME}${NC}"
echo -e "${BLUE}📁 Build directory: ${BUILD_DIR}/${BUILD_NAME}${NC}"

# Cross-platform build warnings
if [ -n "$FORCE_PLATFORM" ] || [ -n "$FORCE_ARCH" ]; then
    echo -e "${YELLOW}⚠️  Cross-platform build detected${NC}"
    if [ "$PLATFORM_NAME" != "$(uname -s | tr '[:upper:]' '[:lower:]' | sed 's/darwin/macos/')" ]; then
        echo -e "${YELLOW}   Note: Building for different OS than current system${NC}"
    fi
    if [ "$ARCH_NAME" != "$(uname -m | sed 's/x86_64/x64/' | sed 's/aarch64/arm64/')" ]; then
        echo -e "${YELLOW}   Note: Building for different architecture than current system${NC}"
    fi
    echo -e "${YELLOW}   Some features may require testing on target platform${NC}"
fi

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
BUILD_PATH="$BUILD_DIR/$APP_NAME"
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

# Create Unix/Linux/macOS startup script
cat > "$BUILD_PATH/start.sh" << 'EOF'
#!/bin/bash

# GitHub Actions Viewer Startup Script
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
PORT=3000
APP_NAME="GitHub Actions Viewer"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}🚀 Starting ${APP_NAME}...${NC}"

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js is required but not installed${NC}"
    echo -e "${YELLOW}Please install Node.js from https://nodejs.org${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠️  Node.js version $NODE_VERSION detected. Version 18+ recommended.${NC}"
fi

# Check if port is already in use
check_port() {
    local port=$1
    if command -v lsof >/dev/null 2>&1; then
        lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1
    elif command -v netstat >/dev/null 2>&1; then
        netstat -an 2>/dev/null | grep ":$port " | grep -q "LISTEN"
    else
        # Fallback: assume port is free
        return 1
    fi
}

if check_port $PORT; then
    echo -e "${YELLOW}⚠️  Port $PORT is already in use. Trying to find an available port...${NC}"
    
    # Find available port starting from 3001
    for port in {3001..3010}; do
        if ! check_port $port; then
            PORT=$port
            break
        fi
    done
    
    if check_port $PORT; then
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
            if command -v open >/dev/null 2>&1; then
                open "$url" 2>/dev/null || true
            fi
            ;;
        Linux)
            if command -v xdg-open >/dev/null 2>&1; then
                xdg-open "$url" 2>/dev/null || true
            elif command -v gnome-open >/dev/null 2>&1; then
                gnome-open "$url" 2>/dev/null || true
            fi
            ;;
        CYGWIN*|MINGW*|MSYS*)
            if command -v start >/dev/null 2>&1; then
                start "$url" 2>/dev/null || true
            fi
            ;;
    esac
}

# Open browser in background
if [ "${NO_BROWSER:-}" != "1" ]; then
    open_browser &
fi

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

echo [INFO] Starting %APP_NAME%...

REM Check if Node.js is available
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required but not installed
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Check Node.js version
for /f "tokens=1 delims=." %%i in ('node -v') do set NODE_MAJOR=%%i
set NODE_MAJOR=%NODE_MAJOR:v=%
if %NODE_MAJOR% lss 18 (
    echo [WARN] Node.js version %NODE_MAJOR% detected. Version 18+ recommended.
)

REM Function to check if port is in use
:check_port
REM Improved port check for Windows (returns 0 if port is in use, 1 if free)
netstat -an | findstr /R /C:":%1 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
    REM Port is in use
    exit /b 0
) else (
    REM Port is free
    exit /b 1
)

REM Check if port is already in use
call :check_port %PORT%
if %errorlevel% equ 0 (
    echo [WARN] Port %PORT% is already in use. Trying to find an available port...
    
    REM Find available port starting from 3001
    for /l %%i in (3001,1,3010) do (
        call :check_port %%i
        if !errorlevel! neq 0 (
            set PORT=%%i
            goto :found_port
        )
    )
    
    echo [ERROR] Could not find an available port
    pause
    exit /b 1
)

:found_port
REM Set environment variables
set NODE_ENV=production
set PORT=%PORT%

REM Start the application
echo [OK] Starting server on port %PORT%...
echo [INFO] Open your browser and navigate to: http://localhost:%PORT%
echo [INFO] Press Ctrl+C to stop the server
echo.

REM Open browser after a short delay (only if NO_BROWSER is not set)
if not defined NO_BROWSER (
    timeout /t 2 /nobreak >nul 2>&1
    start http://localhost:%PORT% 2>nul || echo [INFO] Note: Could not open browser automatically
)

REM Start the Node.js server
node server/index.js

REM Keep window open if there's an error
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server exited with error code %errorlevel%
    pause
)
EOF

# Create README for the build
cat > "$BUILD_PATH/README.md" << EOF
# GitHub Actions Viewer - Portable Distribution

Version: $VERSION
Platform: $PLATFORM_NAME-$ARCH_NAME
$(if [ -n "$FORCE_PLATFORM" ] || [ -n "$FORCE_ARCH" ]; then echo "Build Type: Cross-platform build"; fi)

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

## Environment Variables

You can customize the behavior using environment variables:

- \`PORT\`: Specify a custom port (default: 3000)
- \`NO_BROWSER\`: Set to "1" to disable automatic browser opening
- \`NODE_ENV\`: Environment mode (automatically set to "production")

### Examples:
\`\`\`bash
# Start on a specific port
PORT=8080 ./start.sh

# Start without opening browser
NO_BROWSER=1 ./start.sh
\`\`\`

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

- Node.js 18 or higher (recommended)
- 512MB RAM minimum
- 100MB disk space
- Modern web browser (Chrome, Firefox, Safari, Edge)

## Platform Notes

EOF

# Add platform-specific notes
case $PLATFORM_NAME in
    "macos")
        cat >> "$BUILD_PATH/README.md" << 'EOF'
- This build is optimized for macOS
- Uses native 'open' command for browser launching
EOF
        ;;
    "linux")
        cat >> "$BUILD_PATH/README.md" << 'EOF'
- This build is optimized for Linux
- Uses xdg-open for browser launching
- Follows XDG Base Directory specification for data storage
EOF
        ;;
    "windows")
        cat >> "$BUILD_PATH/README.md" << 'EOF'
- This build is optimized for Windows
- Uses native 'start' command for browser launching
- Data stored in %LOCALAPPDATA%
EOF
        ;;
esac

cat >> "$BUILD_PATH/README.md" << 'EOF'

## Troubleshooting

### Port Already in Use
The application automatically finds an available port starting from 3000.

### Node.js Not Found
Ensure Node.js is installed and available in the system PATH.

### Permission Errors (Unix/Linux/macOS)
Make sure the startup script has execute permissions:
```bash
chmod +x start.sh
```

### Browser Not Opening
Set `NO_BROWSER=1` and open http://localhost:PORT manually.

## Support

For issues and support, please visit the project repository:
**https://github.com/attiasas/github-action-viewer**
EOF

# Create archive
echo -e "${YELLOW}📦 Creating archive...${NC}"
cd $BUILD_DIR
tar -czf "${BUILD_NAME}.tar.gz" "$APP_NAME"
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
EXTRACTED_DIR=$(find "$TEMP_DIR" -name "github-action-viewer" -type d | head -n 1)
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
echo -e "${BLUE}💡 Build Script Usage:${NC}"
echo "   Current build: $0 $([ -n "$FORCE_PLATFORM" ] && echo "-p $FORCE_PLATFORM") $([ -n "$FORCE_ARCH" ] && echo "-a $FORCE_ARCH")"
echo "   Help: $0 --help"
echo "   Cross-platform: $0 -p linux -a x64"
echo ""
echo -e "${YELLOW}� The application will store data in your user directory${NC}"
echo -e "${YELLOW}   so your data persists between runs.${NC}"
