# CardScanner - OCR Card Collection Manager

An Electron desktop application for managing your card collection using OCR technology to scan and identify cards quickly.

## Features

- 📷 **Camera/Phone Scanning** - Use webcam or phone camera to scan cards
- 🔍 **OCR Recognition** - Automatically extract set codes and card numbers
- 🎴 **Scryfall Integration** - Fetch complete card data from Scryfall API
- 💾 **Local Database** - Store your collection locally with SQLite
- 📊 **Collection Management** - Browse, search, and filter your collection
- 📱 **Modern UI** - Dark theme with responsive design
- 🚀 **Cross-Platform** - Works on Windows, macOS, and Linux

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **Vue 3** - Modern reactive UI framework
- **Vite** - Lightning-fast build tool
- **TypeScript** - Type-safe development
- **Tesseract.js** - OCR text extraction
- **SQLite + TypeORM** - Local database
- **Scryfall API** - Card data source

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/cardscanner.git
cd cardscanner

# Install dependencies
npm install

# Start development server
npm run dev
```

## Development

```bash
# Start in development mode
npm run dev

# Build for production
npm run make

# Package without making installers
npm run package
```

## Usage

1. **Scanner Tab**: 
   - Position the card's set code and number in view
   - Click "Capture" or upload an image
   - OCR will extract the text
   - Card data is fetched automatically

2. **Collection Tab**:
   - View all your scanned cards
   - Search and filter by set, rarity, etc.
   - Click cards for detailed view
   - Export collection to CSV

3. **Settings Tab**:
   - Configure camera preferences
   - Manage database backups
   - Customize display options

## How It Works

1. The app uses OCR to read the set code and card number (e.g., "FDN/1")
2. This information is sent to the Scryfall API
3. Complete card data is retrieved and stored locally
4. Your collection is saved in a local SQLite database

## Troubleshooting

- **Camera not working**: Make sure to grant camera permissions
- **OCR not accurate**: Ensure good lighting and clear view of text
- **Card not found**: Manually enter set code and number

## Future Features

- [ ] Deck building interface
- [ ] AI-powered deck suggestions
- [ ] Collection statistics and analytics
- [ ] Trade list management
- [ ] Price tracking
- [ ] Batch import/export

## License

MIT

## Credits

- Card data provided by [Scryfall API](https://scryfall.com/docs/api)
- OCR powered by [Tesseract.js](https://tesseract.projectnaptha.com/)
- Built with [Electron](https://www.electronjs.org/) and [Vue.js](https://vuejs.org/)