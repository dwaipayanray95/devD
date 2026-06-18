#!/bin/bash
set -e

# Color variables for outputs
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}┌────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│        Installing devD Companion       │${NC}"
echo -e "${CYAN}└────────────────────────────────────────┘${NC}"

# Check if Node.js is installed
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}Error: Node.js is not installed.${NC}"
  echo "Please install Node.js (v18 or higher) to run devD: https://nodejs.org"
  exit 1
fi

# Check if NPM is installed
if ! command -v npm >/dev/null 2>&1; then
  echo -e "${RED}Error: NPM is not installed.${NC}"
  echo "NPM is required to install devD."
  exit 1
fi

echo -e "${CYAN}Installing devD globally via npm...${NC}"

# Check if current user has write access to global node_modules prefix folder
NPM_PREFIX=$(npm config get prefix)
if [ -w "$NPM_PREFIX/lib/node_modules" ] || [ -w "$NPM_PREFIX/bin" ] || [ "$EUID" -eq 0 ]; then
  npm install -g dwaipayanray95/devD
else
  echo -e "${CYAN}Write access to global directory requires administrator permissions. Requesting sudo access...${NC}"
  sudo npm install -g dwaipayanray95/devD
fi

echo ""
echo -e "${GREEN}✔ devD successfully installed globally!${NC}"
echo "Start using the companion in any git repository by running:"
echo -e "  ${CYAN}devD${NC}"
echo ""
