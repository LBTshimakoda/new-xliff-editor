#!/bin/bash

echo "======================================"
echo "XLIFF Editor Frontend Setup"
echo "======================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "Node.js version:"
node --version
echo ""

echo "npm version:"
npm --version
echo ""

echo "Installing dependencies..."
echo "This may take a few minutes..."
echo ""

npm install

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Installation failed!"
    exit 1
fi

echo ""
echo "======================================"
echo "Installation complete!"
echo "======================================"
echo ""
echo "To start the development server, run:"
echo "  npm run dev"
echo ""