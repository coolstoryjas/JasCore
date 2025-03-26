import { useState, useEffect } from "react";
import { FileItem } from "../components/FileList";
import { APP_STORAGE_KEYS } from "@/utils/storage";
import { getNonFinderApps } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";

// Database setup
const DB_NAME = "ryOS";
const DB_VERSION = 1;

// Store names
const STORES = {
  DOCUMENTS: "documents",
  IMAGES: "images",
  TRASH: "trash",
} as const;

// Database initialization
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.DOCUMENTS)) {
        db.createObjectStore(STORES.DOCUMENTS, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(STORES.IMAGES)) {
        db.createObjectStore(STORES.IMAGES, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(STORES.TRASH)) {
        db.createObjectStore(STORES.TRASH, { keyPath: "name" });
      }
    };
  });
};

// Generic CRUD operations
const dbOperations = {
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async put<T>(storeName: string, item: T): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName: string, key: string): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clear(storeName: string): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
};

// Sample documents
interface Document {
  name: string;
  content: string;
  type?: string;
}

interface TrashItem extends FileItem {
  originalPath: string;
  deletedAt: number;
}

export const DOCUMENTS: Document[] = [
{
    name: "ABOUTME.md",
    content: `# Architect of digital experience, AI strategy, and UX innovation.

► HELLO! I'M JASMINE.

Welcome to a space where I control the narrative, the experience, and the way my work is shared.

My work sits at the intersection of AI, UX, and human behavior, shaping the future of digital experiences. But innovation isn’t just about the present—it’s about the journey. Explore the system and create. You'll find more information on my journey below. <br></br>

## Leadership Training
- **2025 Rising Leaders Academy**: I’m part of a six-month virtual program designed for rising leaders from underrepresented communities in advertising and marketing. It’s focused on leadership growth, management skills, and fresh strategies for making an impact. With insights from industry experts, I’m gaining practical tools to level up as a leader. I’ll complete the program in summer 2025.
- **First Generation Mentorship Program**: As a mentor in this year-long program, I supported first-generation undergraduate students pursuing careers in marketing and advertising. I provided career advice, shared resources, and helped with personal development, building a meaningful mentor-mentee relationship. Backed by the AMA Collegiate Communities team, I played a key role in guiding the next generation of marketing professionals by sharing my knowledge and experiences to help them navigate their career paths.

## Training & Certifications
- Member of the AI Class Certification
- Digital Strategy Certification
- Generative AI Business Strategy
- AI for Marketers
- Building a Custom GPT
- Intermediate AI Prompt Writing
- Brand Strategy
- Platform Strategy

## Professional Experience
- **Web Experience Strategist, GE HealthCare (Current)**:
Spearhead digital transformation for GEHealthCare.com and 30+ global sites. Develop tailored content and collaborate cross-functionally to align marketing strategies with business objectives. Enhance user experience and design consistency while advocating for AI-driven solutions that deliver measurable business impact.

- **Co-Founder, Gulf Reach Institute (2020 – Current)**:
Co-founded an organization focused on STEM education, Gulf and ocean health, and equity and inclusion. Led initiatives empowering underrepresented youth as future leaders and decision-makers in water protection and conservation.

- **Digital Marketing Manager, Community First Health Plans (2019–2023)**:
Directed digital growth across web, social, email, and SMS channels. Led digital transformation for communityfirsthealthplans.com by aligning digital assets with user needs and business goals. Facilitated user-centered workshops and collaborated with cross-functional teams to create impactful digital experiences.


## Education

- Master of Business Administration, Texas A&M University – San Antonio (2018)
- Bachelor of Science, University of Texas – San Antonio (2016)

## Tools & Technologies

- ContentSquare
- Adobe
- Figma
- Miro
- ChatGPT, Copilot, Claude
- Midjourney, KlingAI


`,
  },
  {
    name: "User Manual.md",
    content: `# Tips for navigating this system efficiently. 

## Using Apps
- Launch apps from the Finder, Desktop, or Apple menu
- Multiple apps can run simultaneously
- Windows can be moved, resized, and minimized
- Use Control Panels to customize your experience

## Finder
- Browse files in Documents, Applications, and Trash
- Navigate with back/forward buttons or path bar
- Sort files by name, kind, size, or date
- Multiple view options (icons, list)
- Move files to Trash and empty when needed
- Monitor available storage space

## TextEdit
- Create and edit rich text documents
- Format text with bold, italic, and underline
- Align text and create ordered/unordered lists
- Use slash commands (/) for quick formatting
- Record audio input for dictation
- Auto-saves your work
- Export documents when needed

## Soundboard
- Create multiple custom soundboards
- Record sounds directly from your microphone
- Customize with emojis and titles
- Play sounds with clicks or number keys (1-9)
- View sound waveforms with WaveSurfer.js
- Import/export soundboards for sharing
- Auto-saves your recordings
- Choose input device
- Toggle waveform/emoji display

## Control Panels
- Customize system appearance
  - Choose from tiled patterns or photos
  - Multiple categories of wallpapers
  - Real-time preview
- Adjust sound settings
  - Enable/disable UI sounds
  - Configure typing synthesis
  - Choose synth presets
- Manage system
  - Backup all settings
  - Restore from backup
  - Reset to defaults
  - Format file system

## Minesweeper
- Classic puzzle game with modern features
- Left-click to reveal cells
- Right-click to flag mines
- Sound effects for actions
- Track remaining mines
- Start new game anytime

## Internet Explorer
- Browse web content
- Time travel feature to see historical dates
- Add websites to favorites
- Modern browsing experience
- Classic System 7 style interface

## Videos
- Make video playlists and watch them
- Add videos to favorites
- VHS-style video player interface

## Virtual PC
- Play classic PC games like Doom and SimCity
- Launch from Applications folder
- Use keyboard shortcuts for game controls
- Save game progress automatically
- Switch between multiple games
- Adjust emulator settings in Control Panels
- Import/export game saves
- Full-screen mode available

`,
  },
];

// Initialize database with sample documents if empty
const initializeDatabase = async () => {
  try {
    const existingDocs = await dbOperations.getAll<Document>(STORES.DOCUMENTS);
    if (existingDocs.length === 0) {
      for (const doc of DOCUMENTS) {
        await dbOperations.put(STORES.DOCUMENTS, doc);
      }
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

// Helper function to detect file type
function getFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "bmp":
      return "image";
    case "md":
      return "markdown";
    case "txt":
      return "text";
    default:
      return "unknown";
  }
}

// Helper function to get file icon based on type
function getFileIcon(fileName: string, isDirectory: boolean): string {
  if (isDirectory) return "/icons/directory.png";

  const type = getFileType(fileName);
  switch (type) {
    case "image":
      return "/icons/image.png";
    case "markdown":
    case "text":
      return "/icons/file-text.png";
    default:
      return "/icons/file.png";
  }
}

export function useFileSystem(initialPath: string = "/") {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [images, setImages] = useState<Document[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [history, setHistory] = useState<string[]>([initialPath]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const launchApp = useLaunchApp();

  // Initialize database and load data
  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeDatabase();
        const [docs, imgs, trash] = await Promise.all([
          dbOperations.getAll<Document>(STORES.DOCUMENTS),
          dbOperations.getAll<Document>(STORES.IMAGES),
          dbOperations.getAll<TrashItem>(STORES.TRASH),
        ]);
        setDocuments(docs);
        setImages(imgs);
        setTrashItems(trash);
      } catch (err) {
        console.error("Error loading data:", err);
        setError("Failed to load data");
      }
    };
    loadData();
  }, []);

  // Load files whenever path, documents, or trash items change
  useEffect(() => {
    loadFiles();
  }, [currentPath, documents, images, trashItems]);

  // Listen for file save events
  useEffect(() => {
    const handleFileSave = async (event: CustomEvent<FileItem>) => {
      if (!event.detail.content) return;

      const newDoc: Document = {
        name: event.detail.name,
        content: event.detail.content,
        type: event.detail.type || getFileType(event.detail.name),
      };

      try {
        // Only save to one location based on the file path
        if (event.detail.path.startsWith("/Images/")) {
          await dbOperations.put(STORES.IMAGES, newDoc);
          await dbOperations.delete(STORES.DOCUMENTS, newDoc.name);
          setImages((prev) => {
            const newImages = [...prev];
            const existingIndex = newImages.findIndex(
              (img) => img.name === newDoc.name
            );
            if (existingIndex >= 0) {
              newImages[existingIndex] = newDoc;
            } else {
              newImages.push(newDoc);
            }
            return newImages;
          });
          setDocuments((prev) =>
            prev.filter((doc) => doc.name !== newDoc.name)
          );
        } else if (event.detail.path.startsWith("/Documents/")) {
          await dbOperations.put(STORES.DOCUMENTS, newDoc);
          await dbOperations.delete(STORES.IMAGES, newDoc.name);
          setDocuments((prev) => {
            const newDocs = [...prev];
            const existingIndex = newDocs.findIndex(
              (doc) => doc.name === newDoc.name
            );
            if (existingIndex >= 0) {
              newDocs[existingIndex] = newDoc;
            } else {
              newDocs.push(newDoc);
            }
            return newDocs;
          });
          setImages((prev) => prev.filter((img) => img.name !== newDoc.name));
        }
      } catch (err) {
        console.error("Error saving file:", err);
        setError("Failed to save file");
      }
    };

    const eventListener = (event: Event) => {
      handleFileSave(event as CustomEvent<FileItem>);
    };

    window.addEventListener("saveFile", eventListener);
    return () => {
      window.removeEventListener("saveFile", eventListener);
    };
  }, []);

  async function loadFiles() {
    setIsLoading(true);
    setError(undefined);

    try {
      let simulatedFiles: FileItem[] = [];

      // Root directory
      if (currentPath === "/") {
        simulatedFiles = [
          {
            name: "Applications",
            isDirectory: true,
            path: "/Applications",
            icon: "/icons/applications.png",
            type: "directory",
          },
          {
            name: "Documents",
            isDirectory: true,
            path: "/Documents",
            icon: "/icons/documents.png",
            type: "directory",
          },
          {
            name: "Images",
            isDirectory: true,
            path: "/Images",
            icon: "/icons/images.png",
            type: "directory",
          },
          {
            name: "Trash",
            isDirectory: true,
            path: "/Trash",
            icon:
              trashItems.length > 0
                ? "/icons/trash-full.png"
                : "/icons/trash-empty.png",
            type: "directory",
          },
        ];
      }
      // Applications directory
      else if (currentPath === "/Applications") {
        simulatedFiles = getNonFinderApps().map((app) => ({
          name: app.name,
          isDirectory: false,
          path: `/Applications/${app.name}`,
          icon: app.icon,
          appId: app.id,
          type: "application",
        }));
      }
      // Documents directory
      else if (currentPath === "/Documents") {
        simulatedFiles = documents.map((doc) => ({
          name: doc.name,
          isDirectory: false,
          path: `/Documents/${doc.name}`,
          icon: getFileIcon(doc.name, false),
          content: doc.content,
          type: doc.type || getFileType(doc.name),
        }));
      }
      // Images directory
      else if (currentPath === "/Images") {
        simulatedFiles = images.map((img) => ({
          name: img.name,
          isDirectory: false,
          path: `/Images/${img.name}`,
          icon: getFileIcon(img.name, false),
          content: img.content,
          type: img.type || getFileType(img.name),
        }));
      }
      // Trash directory
      else if (currentPath === "/Trash") {
        simulatedFiles = trashItems.map((item) => ({
          ...item,
          path: `/Trash/${item.name}`,
          icon: getFileIcon(item.name, item.isDirectory),
          type: item.type || getFileType(item.name),
        }));
      }

      setFiles(simulatedFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  }

  function handleFileOpen(file: FileItem) {
    if (file.isDirectory) {
      setCurrentPath(file.path);
      return;
    }

    // Handle opening files based on their location
    if (file.path.startsWith("/Applications/")) {
      // Launch the corresponding app
      if (file.appId) {
        const appState = localStorage.getItem(
          APP_STORAGE_KEYS[file.appId as keyof typeof APP_STORAGE_KEYS]?.WINDOW
        );
        if (!appState) {
          // Set initial window state if not exists
          localStorage.setItem(
            APP_STORAGE_KEYS[file.appId as keyof typeof APP_STORAGE_KEYS]
              ?.WINDOW,
            JSON.stringify({
              position: { x: 100, y: 100 },
              size: { width: 600, height: 400 },
            })
          );
        }
        // Dispatch app launch event
        launchApp(file.appId);
      }
    } else if (file.path.startsWith("/Documents/")) {
      // Open document in TextEdit
      if (file.content) {
        // Launch TextEdit first
        const textEditState = localStorage.getItem(
          APP_STORAGE_KEYS.textedit.WINDOW
        );
        if (!textEditState) {
          localStorage.setItem(
            APP_STORAGE_KEYS.textedit.WINDOW,
            JSON.stringify({
              position: { x: 100, y: 100 },
              size: { width: 600, height: 400 },
            })
          );
        }

        // Store the file content temporarily
        localStorage.setItem(
          "pending_file_open",
          JSON.stringify({
            path: file.path,
            content: file.content,
          })
        );

        // Launch TextEdit
        launchApp("textedit");
      }
    } else if (file.path.startsWith("/Images/")) {
      // Launch Paint app with the image
      const paintState = localStorage.getItem(APP_STORAGE_KEYS.paint.WINDOW);
      if (!paintState) {
        localStorage.setItem(
          APP_STORAGE_KEYS.paint.WINDOW,
          JSON.stringify({
            position: { x: 100, y: 100 },
            size: { width: 713, height: 480 },
          })
        );
      }

      // Store the file content temporarily
      localStorage.setItem(
        "pending_file_open",
        JSON.stringify({
          path: file.path,
          content: file.content,
        })
      );

      // Launch Paint
      launchApp("paint");
    }
  }

  function handleFileSelect(file: FileItem) {
    setSelectedFile(file);
  }

  function navigateUp() {
    if (currentPath === "/") return;
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
    navigateToPath(parentPath);
  }

  function navigateToPath(path: string) {
    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // Add to history if it's a new path
    if (normalizedPath !== currentPath) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(normalizedPath);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setCurrentPath(normalizedPath);
    }
  }

  function navigateBack() {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(history[historyIndex - 1]);
    }
  }

  function navigateForward() {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(history[historyIndex + 1]);
    }
  }

  function canNavigateBack() {
    return historyIndex > 0;
  }

  function canNavigateForward() {
    return historyIndex < history.length - 1;
  }

  async function moveToTrash(file: FileItem) {
    if (file.path === "/Trash" || file.path.startsWith("/Trash/")) return;

    const trashItem: TrashItem = {
      ...file,
      originalPath: file.path,
      deletedAt: Date.now(),
    };

    try {
      await dbOperations.put(STORES.TRASH, trashItem);
      setTrashItems((prev) => [...prev, trashItem]);

      // Remove from documents if it's a document
      if (file.path.startsWith("/Documents/")) {
        await dbOperations.delete(STORES.DOCUMENTS, file.name);
        setDocuments((prev) => prev.filter((doc) => doc.name !== file.name));
      }
      // Remove from images if it's an image
      else if (file.path.startsWith("/Images/")) {
        await dbOperations.delete(STORES.IMAGES, file.name);
        setImages((prev) => prev.filter((img) => img.name !== file.name));
      }
    } catch (err) {
      console.error("Error moving to trash:", err);
      setError("Failed to move file to trash");
    }
  }

  async function restoreFromTrash(file: FileItem) {
    if (!file.path.startsWith("/Trash/")) return;

    const trashItem = trashItems.find((item) => item.name === file.name);
    if (!trashItem) return;

    try {
      // Restore to original location
      if (trashItem.originalPath.startsWith("/Documents/")) {
        const newDoc: Document = {
          name: trashItem.name,
          content: trashItem.content || "",
          type: trashItem.type || getFileType(trashItem.name),
        };
        await dbOperations.put(STORES.DOCUMENTS, newDoc);
        setDocuments((prev) => [...prev, newDoc]);
      }
      // Restore to images if it was originally an image
      else if (trashItem.originalPath.startsWith("/Images/")) {
        const newImage: Document = {
          name: trashItem.name,
          content: trashItem.content || "",
          type: trashItem.type || getFileType(trashItem.name),
        };
        await dbOperations.put(STORES.IMAGES, newImage);
        setImages((prev) => [...prev, newImage]);
      }

      // Remove from trash
      await dbOperations.delete(STORES.TRASH, file.name);
      setTrashItems((prev) => prev.filter((item) => item.name !== file.name));
    } catch (err) {
      console.error("Error restoring from trash:", err);
      setError("Failed to restore file from trash");
    }
  }

  async function emptyTrash() {
    try {
      await dbOperations.clear(STORES.TRASH);
      setTrashItems([]);
    } catch (err) {
      console.error("Error emptying trash:", err);
      setError("Failed to empty trash");
    }
  }

  async function saveFile(file: FileItem) {
    if (!file.content) return;

    const newDoc: Document = {
      name: file.name,
      content: file.content,
      type: file.type || getFileType(file.name),
    };

    try {
      // Only save to one location based on the file path
      if (file.path.startsWith("/Images/")) {
        await dbOperations.put(STORES.IMAGES, newDoc);
        await dbOperations.delete(STORES.DOCUMENTS, newDoc.name);
        setImages((prev) => {
          const newImages = [...prev];
          const existingIndex = newImages.findIndex(
            (img) => img.name === newDoc.name
          );
          if (existingIndex >= 0) {
            newImages[existingIndex] = newDoc;
          } else {
            newImages.push(newDoc);
          }
          return newImages;
        });
        setDocuments((prev) => prev.filter((doc) => doc.name !== newDoc.name));
      } else if (file.path.startsWith("/Documents/")) {
        await dbOperations.put(STORES.DOCUMENTS, newDoc);
        await dbOperations.delete(STORES.IMAGES, newDoc.name);
        setDocuments((prev) => {
          const newDocs = [...prev];
          const existingIndex = newDocs.findIndex(
            (doc) => doc.name === newDoc.name
          );
          if (existingIndex >= 0) {
            newDocs[existingIndex] = newDoc;
          } else {
            newDocs.push(newDoc);
          }
          return newDocs;
        });
        setImages((prev) => prev.filter((img) => img.name !== newDoc.name));
      }
    } catch (err) {
      console.error("Error saving file:", err);
      setError("Failed to save file");
    }
  }

  async function renameFile(oldName: string, newName: string) {
    try {
      const doc = await dbOperations.get<Document>(STORES.DOCUMENTS, oldName);
      if (doc) {
        const newDoc = { ...doc, name: newName };
        await dbOperations.put(STORES.DOCUMENTS, newDoc);
        await dbOperations.delete(STORES.DOCUMENTS, oldName);
        setDocuments((prev) => {
          const newDocs = [...prev];
          const existingIndex = newDocs.findIndex((d) => d.name === oldName);
          if (existingIndex >= 0) {
            newDocs[existingIndex] = newDoc;
          }
          return newDocs;
        });
      }
    } catch (err) {
      console.error("Error renaming file:", err);
      setError("Failed to rename file");
    }
  }

  async function formatFileSystem() {
    try {
      // Clear all stores except DOCUMENTS (which will be reset to sample documents)
      await Promise.all([
        dbOperations.clear(STORES.IMAGES),
        dbOperations.clear(STORES.TRASH),
      ]);

      // Reset documents to sample documents
      await dbOperations.clear(STORES.DOCUMENTS);
      for (const doc of DOCUMENTS) {
        await dbOperations.put(STORES.DOCUMENTS, doc);
      }

      // Update state
      setDocuments(DOCUMENTS);
      setImages([]);
      setTrashItems([]);
      setError(undefined);
    } catch (err) {
      console.error("Error formatting file system:", err);
      setError("Failed to format file system");
    }
  }

  return {
    currentPath,
    files,
    selectedFile,
    isLoading,
    error,
    handleFileOpen,
    handleFileSelect,
    navigateUp,
    navigateToPath,
    moveToTrash,
    restoreFromTrash,
    emptyTrash,
    trashItems,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    saveFile,
    setSelectedFile,
    renameFile,
    formatFileSystem,
  };
}