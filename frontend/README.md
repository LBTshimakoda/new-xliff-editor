# XLIFF Editor Frontend

React + TypeScript + Vite application for editing XLIFF files.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The app will open at `http://localhost:3000`

## 📁 Project Structure

```
frontend/
├── src/
│   ├── App.tsx          # Main application component
│   ├── types.ts         # TypeScript interfaces
│   ├── main.tsx         # React entry point
│   └── index.css        # Global styles (Tailwind)
├── index.html           # HTML template
├── package.json         # Dependencies
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript config
├── tailwind.config.js   # Tailwind CSS config
└── postcss.config.js    # PostCSS config
```

## 🛠 Available Scripts

- **`npm run dev`** - Start development server
- **`npm run build`** - Build for production
- **`npm run preview`** - Preview production build
- **`npm run lint`** - Check TypeScript types

## 📦 Dependencies

### Production
- **React 18** - UI library
- **lucide-react** - Icon library

### Development
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS
- **PostCSS** - CSS processing
- **Autoprefixer** - CSS vendor prefixes

## 🎨 Features

- ✅ File upload interface
- ✅ Tree view for XLIFF structure
- ✅ Translation unit browser
- ✅ Tag visualization with lock indicators
- ✅ Source/Target segment display
- ✅ File download functionality
- 🔜 Editable target fields (next step)
- 🔜 Real-time updates
- 🔜 Search and filter

## 🔌 Backend Integration

The frontend connects to the FastAPI backend at `http://localhost:8000`

Make sure the backend is running before starting the frontend!

## 🎓 Learning Points

- **React Hooks**: useState, useEffect
- **TypeScript**: Interfaces, type safety
- **Vite**: Fast build tool
- **Tailwind CSS**: Utility classes
- **REST API**: fetch, file upload/download
- **Component design**: Separation of concerns

## 🐛 Troubleshooting

**Backend connection errors:**
- Ensure backend is running on `http://localhost:8000`
- Check browser console for CORS errors

**Port 3000 already in use:**
- Change port in `vite.config.ts`

**Module not found:**
- Run `npm install`

**Build errors:**
- Delete `node_modules` and run `npm install` again
- Clear Vite cache: `rm -rf node_modules/.vite`

## 🎯 Next Development Steps

1. **Make target editable** - Add contentEditable or rich text editor
2. **Tag preservation** - Prevent tag deletion during editing
3. **Save changes** - Call backend API on edit
4. **Validation** - Ensure tag integrity
5. **Search/Filter** - Find specific translation units
6. **Keyboard shortcuts** - Improve UX

## 🚀 Production Build

```bash
npm run build
```

Output will be in `dist/` folder.

To preview:
```bash
npm run preview
```

Deploy the `dist/` folder to any static hosting service!