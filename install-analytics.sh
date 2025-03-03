#!/bin/bash
# Query Analytics System Installation Script
# This script automates the installation and setup of the Funnelback Query Analytics System

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}  Funnelback Query Analytics Setup Script     ${NC}"
echo -e "${BLUE}==============================================${NC}"

# Check if we're in the root of the project
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Please run this script from the root of your Funnelback Proxy project${NC}"
  exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js is not installed. Please install Node.js before running this script.${NC}"
  exit 1
fi

echo -e "${YELLOW}Starting installation...${NC}"

# Create necessary directories
echo -e "${BLUE}Creating directory structure...${NC}"
mkdir -p lib
mkdir -p dashboard/frontend/src

# Install required dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
npm install --save mongoose mongodb express cors dotenv
