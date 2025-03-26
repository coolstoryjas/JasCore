# JASCORE — Web-based Desktop Environment

A modern web-based desktop environment inspired by classic macOS, built with React and modern web technologies. Features multiple built-in applications and a familiar desktop interface. Works on all devices—including mobile, tablet, and desktop.

## Tech Stack

- React 18.3 with TypeScript
- Vite 6.0 for blazing fast development
- TailwindCSS 4.0 for styling
- shadcn/ui components
- Framer Motion for animations
- Bun as package manager
- WaveSurfer.js for audio visualization
- Tone.js for audio synthesis

## Getting Started

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Build for production
bun run build
```

## Features

### Desktop Environment

- Authentic macOS-style window management
- Multiple resizable and draggable windows
- Desktop icons and dock
- Window minimize/maximize controls
- Menu bar with application-specific menus
- Customizable wallpapers (tiled patterns and photos)
- System-wide sound effects
- Local storage persistence

### Built-in Applications

- **Finder**: File system navigation and management
- **Text Editor**: Rich text editing with markdown support
- **MacPaint**: Classic bitmap graphics editor
  - Drawing tools (pencil, brush, eraser)
  - Shape tools (rectangle, oval, line)
  - Fill patterns and colors
  - Selection and move tools
  - Undo/redo support
- **Videos**: Retro-style YouTube playlist player
  - Add and manage YouTube videos
  - Playlist management
  - Shuffle and repeat modes
  - LCD display with scrolling titles
  - Classic CD player controls
  - Local storage persistence
- **Soundboard**: Create and manage custom soundboards
  - Record audio from microphone
  - Multiple soundboards support
  - Waveform visualization
  - Keyboard shortcuts (1-9)
  - Import/export functionality
  - Emoji and title customization
- **Control Panels**: System settings
  - Appearance customization
  - Sound settings
  - System management
  - Backup and restore
- **Minesweeper**: Classic game implementation
- **Internet Explorer**: Classic web browser experience

### Core Features

- Window management system with z-index handling
- Application state management
- Local storage persistence
- Keyboard shortcuts
- Dark mode support
- Responsive design
- File system with Documents and Applications
- System-wide audio controls
- Import/Export functionality
- Backup and restore capabilities

## Development

The project uses:

- TypeScript for type safety
- ESLint for code quality
- Tailwind for utility-first CSS
- shadcn/ui components built on Radix UI primitives
- Lucide icons
- Vercel for deployment
