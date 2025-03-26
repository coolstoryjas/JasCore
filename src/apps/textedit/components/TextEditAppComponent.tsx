import { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { TextEditMenuBar } from "./TextEditMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata, helpItems } from "..";
import { APP_STORAGE_KEYS } from "@/utils/storage";
import { SlashCommands } from "../extensions/SlashCommands";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AudioInputButton } from "@/components/ui/audio-input-button";
import { ChevronDown } from "lucide-react";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useSound, Sounds } from "@/hooks/useSound";

// Function to convert HTML to Markdown
const htmlToMarkdown = (html: string): string => {
  let markdown = html;

  // Convert tables
  markdown = markdown.replace(
    /<table[^>]*>(.*?)<\/table>/gis,
    (_, tableContent) => {
      const rows = tableContent.match(/<tr[^>]*>.*?<\/tr>/gis) || [];
      if (rows.length === 0) return "";

      const markdownRows = rows.map((row: string) => {
        const cells = row.match(/<t[dh][^>]*>(.*?)<\/t[dh]>/gi) || [];
        return (
          "| " +
          cells
            .map((cell: string) =>
              cell
                .replace(/<t[dh][^>]*>(.*?)<\/t[dh]>/i, "$1")
                .trim()
                .replace(/\|/g, "\\|")
            )
            .join(" | ") +
          " |"
        );
      });

      // Insert header separator after first row
      if (markdownRows.length > 0) {
        const columnCount = (markdownRows[0].match(/\|/g) || []).length - 1;
        const separator = "\n|" + " --- |".repeat(columnCount);
        markdownRows.splice(1, 0, separator);
      }

      return "\n" + markdownRows.join("\n") + "\n";
    }
  );

  // Convert code blocks
  markdown = markdown.replace(
    /<pre[^>]*><code[^>]*(?:class="language-([^"]+)")?[^>]*>(.*?)<\/code><\/pre>/gis,
    (_, language, code) => {
      const lang = language || "";
      return `\n\`\`\`${lang}\n${code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")}\n\`\`\`\n`;
    }
  );

  // Convert inline code
  markdown = markdown.replace(
    /<code[^>]*>(.*?)<\/code>/gi,
    (_, code) =>
      `\`${code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")}\``
  );

  // Basic HTML to Markdown conversion (existing conversions)
  markdown = markdown
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<u[^>]*>(.*?)<\/u>/gi, "_$1_")
    .replace(/<ul[^>]*>(.*?)<\/ul>/gi, (_, list) => {
      return list
        .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
        .replace(/<[^>]+>/g, "");
    })
    .replace(/<ol[^>]*>(.*?)<\/ol>/gi, (_, list) => {
      let index = 1;
      return list
        .replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${index++}. $1\n`)
        .replace(/<[^>]+>/g, "");
    })
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<br[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "") // Remove any remaining HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/\n\n+/g, "\n\n") // Normalize multiple newlines
    .trim();

  return markdown;
};

// Function to convert HTML to plain text
const htmlToPlainText = (html: string): string => {
  return html
    .replace(/<[^>]+>/g, "") // Remove all HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/\n\n+/g, "\n\n")
    .trim();
};

// Function to convert Markdown to HTML
const markdownToHtml = (markdown: string): string => {
  let html = markdown;

  // Convert headings
  html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>");

  // Convert bold and italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<u>$1</u>");

  // Convert lists
  html = html.replace(/^\s*[-*+]\s+(.*)$/gm, "<ul><li>$1</li></ul>");
  html = html.replace(/^\s*\d+\.\s+(.*)$/gm, "<ol><li>$1</li></ol>");

  // Merge adjacent list items
  html = html.replace(/<\/ul>\s*<ul>/g, "");
  html = html.replace(/<\/ol>\s*<ol>/g, "");

  // Convert code blocks
  html = html.replace(/```([^`]*?)```/gs, "<pre><code>$1</code></pre>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Convert paragraphs (lines not starting with special characters)
  html = html.replace(/^(?![#<*_\s*-+\d.])(.*$)/gm, "<p>$1</p>");

  // Clean up empty paragraphs and normalize whitespace
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.trim();

  return html;
};

// Function to remove file extension
const removeFileExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, "");
};

export function TextEditAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isConfirmNewDialogOpen, setIsConfirmNewDialogOpen] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [saveFileName, setSaveFileName] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { files, saveFile } = useFileSystem("/Documents");
  const launchApp = useLaunchApp();
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      SlashCommands,
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm prose-neutral max-w-none focus:outline-none p-4 [&>ul]:list-disc [&>ol]:list-decimal [&>*]:my-1 [&>p]:leading-5 [&>h1]:mt-3 [&>h1]:mb-2 [&>h2]:mt-2 [&>h2]:mb-1 [&>ul]:my-1 [&>ol]:my-1 [&>ul>li]:my-0.5 [&>ol>li]:my-0.5 [&>ul]:pl-0 [&>ol]:pl-4 [&>ul>li>p]:my-0 [&>ol>li>p]:my-0 [&>ul>li]:pl-0 [&>ol>li]:pl-0 [&>ul>li]:marker:text-neutral-900 [&>ol>li]:marker:text-neutral-900 [&>ul[data-type='taskList']]:ml-0 [&>ul[data-type='taskList']]:list-none [&>ul[data-type='taskList']>li]:flex [&>ul[data-type='taskList']>li]:items-start [&>ul[data-type='taskList']>li>label]:mr-2 [&>ul[data-type='taskList']>li>label>input]:mt-1 [&>ul[data-type='taskList']>li>div]:flex-1 [&>ul[data-type='taskList']>li>div>p]:my-0 min-h-full font-geneva-12 text-[12px] [&>h1]:text-[24px] [&>h2]:text-[20px] [&>h3]:text-[16px] [&>h1]:font-['ChicagoKare'] [&>h2]:font-['ChicagoKare'] [&>h3]:font-['ChicagoKare']",
      },
    },
    onUpdate: ({ editor }) => {
      // Store both HTML and JSON to preserve whitespace
      const jsonContent = editor.getJSON();
      // Always save to localStorage for recovery
      localStorage.setItem(
        APP_STORAGE_KEYS.textedit.CONTENT,
        JSON.stringify(jsonContent)
      );

      if (currentFilePath) {
        // If we have a current file path, autosave to that location
        const fileName = currentFilePath.split("/").pop() || "Untitled";
        // Dispatch saveFile event instead of directly calling saveFile
        const saveEvent = new CustomEvent("saveFile", {
          detail: {
            name: fileName,
            path: currentFilePath,
            content: JSON.stringify(jsonContent),
            icon: "/icons/file-text.png",
            isDirectory: false,
          },
        });
        window.dispatchEvent(saveEvent);
      }

      setHasUnsavedChanges(true);
    },
  });

  // Initial load - try to restore last opened file or pending content
  useEffect(() => {
    if (editor && !hasUnsavedChanges) {
      const lastFilePath = localStorage.getItem(
        APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
      );

      if (lastFilePath?.startsWith("/Documents/")) {
        // Try to restore the last opened file
        const file = files.find((f) => f.path === lastFilePath);
        if (file?.content && !currentFilePath) {
          try {
            const jsonContent = JSON.parse(file.content);
            editor.commands.setContent(jsonContent);
          } catch {
            // Fallback to treating content as HTML/MD if not JSON
            const content = lastFilePath.endsWith(".md")
              ? markdownToHtml(file.content)
              : file.content;
            editor.commands.setContent(content);
          }
          setCurrentFilePath(lastFilePath);
          setHasUnsavedChanges(false);
        }
      } else if (!currentFilePath) {
        // Only load from localStorage if we don't have any file path
        const savedContent = localStorage.getItem(
          APP_STORAGE_KEYS.textedit.CONTENT
        );
        if (savedContent) {
          try {
            const jsonContent = JSON.parse(savedContent);
            editor.commands.setContent(jsonContent);
          } catch {
            // Fallback to treating content as HTML if not JSON
            editor.commands.setContent(savedContent);
          }
        }
      }
    }
  }, [editor, files, currentFilePath, hasUnsavedChanges]);

  // Add listeners for external document updates (like from Chat app)
  useEffect(() => {
    // Listen for direct content update requests
    const handleUpdateEditorContent = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath && e.detail?.content) {
        try {
          // Try to parse the content as JSON
          const jsonContent = JSON.parse(e.detail.content);

          // Keep the current cursor position if possible
          const { from, to } = editor.state.selection;

          // Update the content
          editor.commands.setContent(jsonContent);

          // Try to restore cursor position
          if (from && to && from === to) {
            try {
              editor.commands.setTextSelection(
                Math.min(from, editor.state.doc.content.size)
              );
            } catch (e) {
              console.log("Could not restore cursor position", e);
            }
          }

          // Make sure we don't mark this as an unsaved change
          setHasUnsavedChanges(false);

          console.log("Editor content updated from external source");
        } catch (error) {
          console.error("Failed to update editor content:", error);
        }
      }
    };

    // Handle content changed notifications
    const handleContentChanged = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath) {
        // Reload content from localStorage
        const savedContent = localStorage.getItem(
          APP_STORAGE_KEYS.textedit.CONTENT
        );
        if (savedContent) {
          try {
            const jsonContent = JSON.parse(savedContent);
            editor.commands.setContent(jsonContent);
            setHasUnsavedChanges(false);
            console.log(
              "Editor content reloaded from localStorage after content changed event"
            );
          } catch (error) {
            console.error("Failed to reload content:", error);
          }
        }
      }
    };

    // Handle document updated notifications
    const handleDocumentUpdated = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath && e.detail?.content) {
        try {
          const jsonContent = JSON.parse(e.detail.content);
          editor.commands.setContent(jsonContent);
          setHasUnsavedChanges(false);
          console.log("Editor content updated after document updated event");
        } catch (error) {
          console.error(
            "Failed to update editor with document updated event:",
            error
          );
        }
      }
    };

    // Set up event listeners
    window.addEventListener(
      "updateEditorContent",
      handleUpdateEditorContent as EventListener
    );
    window.addEventListener(
      "contentChanged",
      handleContentChanged as EventListener
    );
    window.addEventListener(
      "documentUpdated",
      handleDocumentUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        "updateEditorContent",
        handleUpdateEditorContent as EventListener
      );
      window.removeEventListener(
        "contentChanged",
        handleContentChanged as EventListener
      );
      window.removeEventListener(
        "documentUpdated",
        handleDocumentUpdated as EventListener
      );
    };
  }, [editor, currentFilePath]);

  // Check for pending file open when window becomes active
  useEffect(() => {
    if (isForeground && editor) {
      const pendingFileOpen = localStorage.getItem("pending_file_open");
      if (pendingFileOpen) {
        try {
          const { path, content } = JSON.parse(pendingFileOpen);
          if (path.startsWith("/Documents/")) {
            // Only show discard changes warning if we have unsaved changes in an untitled document
            if (hasUnsavedChanges && !currentFilePath) {
              setIsConfirmNewDialogOpen(true);
            } else {
              editor.commands.clearContent();
              try {
                // First try to parse as JSON (for documents saved by TextEdit)
                const jsonContent = JSON.parse(content);
                editor.commands.setContent(jsonContent);
                // Save the file to ensure it's registered for autosaving
                const fileName = path.split("/").pop() || "Untitled";
                saveFile({
                  name: fileName,
                  path: path,
                  content: content,
                  icon: "/icons/file-text.png",
                  isDirectory: false,
                });
              } catch {
                // If not JSON, process as plain text or markdown
                const processedContent = path.endsWith(".md")
                  ? markdownToHtml(content)
                  : content;
                editor.commands.setContent(processedContent);
                // Save the processed content
                const fileName = path.split("/").pop() || "Untitled";
                saveFile({
                  name: fileName,
                  path: path,
                  content: JSON.stringify(editor.getJSON()),
                  icon: "/icons/file-text.png",
                  isDirectory: false,
                });
              }
              setCurrentFilePath(path);
              setHasUnsavedChanges(false);
              // Store the file path for next time
              localStorage.setItem(
                APP_STORAGE_KEYS.textedit.LAST_FILE_PATH,
                path
              );
              // Store content in case app crashes
              localStorage.setItem(
                APP_STORAGE_KEYS.textedit.CONTENT,
                JSON.stringify(editor.getJSON())
              );
            }
          }
        } catch (e) {
          console.error("Failed to parse pending file open data:", e);
        } finally {
          localStorage.removeItem("pending_file_open");
        }
      }
    }
  }, [isForeground, editor]);

  const handleTranscriptionComplete = (text: string) => {
    setIsTranscribing(false);
    if (editor) {
      // If editor is not focused, focus it first
      if (!editor.isFocused) {
        editor.commands.focus();
      }

      // If there's no selection (cursor position), move to the end and add a new paragraph
      if (editor.state.selection.empty && editor.state.selection.anchor === 0) {
        editor.commands.setTextSelection(editor.state.doc.content.size);
        editor.commands.insertContent("\n");
      }

      // Insert the transcribed text at current cursor position
      editor.commands.insertContent(text);
    }
  };

  const handleTranscriptionStart = () => {
    setIsTranscribing(true);
  };

  const handleNewFile = () => {
    if (editor && hasUnsavedChanges) {
      setIsConfirmNewDialogOpen(true);
    } else {
      createNewFile();
    }
  };

  const createNewFile = () => {
    if (editor) {
      editor.commands.clearContent();
      localStorage.removeItem(APP_STORAGE_KEYS.textedit.CONTENT);
      localStorage.removeItem(APP_STORAGE_KEYS.textedit.LAST_FILE_PATH);
      setCurrentFilePath(null);
      setHasUnsavedChanges(false);

      // Check if there's a pending file to open after creating new file
      const pendingFileOpen = localStorage.getItem("pending_file_open");
      if (pendingFileOpen) {
        try {
          const { path, content } = JSON.parse(pendingFileOpen);
          if (path.startsWith("/Documents/")) {
            const processedContent = path.endsWith(".md")
              ? markdownToHtml(content)
              : content;
            editor.commands.setContent(processedContent);
            setCurrentFilePath(path);
            setHasUnsavedChanges(false);
            // Store the file path for next time
            localStorage.setItem(
              APP_STORAGE_KEYS.textedit.LAST_FILE_PATH,
              path
            );
            // Store content in case app crashes
            localStorage.setItem(
              APP_STORAGE_KEYS.textedit.CONTENT,
              processedContent
            );
          }
        } catch (e) {
          console.error("Failed to parse pending file open data:", e);
        } finally {
          localStorage.removeItem("pending_file_open");
        }
      }
    }
  };

  const handleSave = () => {
    if (!editor) return;

    if (!currentFilePath) {
      // Get the first line of content and use it as suggested filename
      const content = editor.getHTML();
      const firstLine = content
        .split("\n")[0] // Get first line
        .replace(/<[^>]+>/g, "") // Remove HTML tags
        .split("-")[0] // Split by - and take first part
        .trim() // Remove whitespace
        .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .substring(0, 50); // Limit length

      setIsSaveDialogOpen(true);
      setSaveFileName(`${firstLine || "Untitled"}.md`);
    } else {
      const content = JSON.stringify(editor.getJSON());
      const fileName = currentFilePath.split("/").pop() || "Untitled";

      // Dispatch saveFile event instead of directly calling saveFile
      const saveEvent = new CustomEvent("saveFile", {
        detail: {
          name: fileName,
          path: currentFilePath,
          content: content,
          icon: "/icons/file-text.png",
          isDirectory: false,
        },
      });
      window.dispatchEvent(saveEvent);

      // Store content in case app crashes
      localStorage.setItem(APP_STORAGE_KEYS.textedit.CONTENT, content);
      // Store the file path for next time
      localStorage.setItem(
        APP_STORAGE_KEYS.textedit.LAST_FILE_PATH,
        currentFilePath
      );
      setHasUnsavedChanges(false);
    }
  };

  const handleSaveSubmit = (fileName: string) => {
    if (!editor) return;

    const content = JSON.stringify(editor.getJSON());
    const filePath = `/Documents/${fileName}${
      fileName.endsWith(".md") ? "" : ".md"
    }`;

    // Dispatch saveFile event instead of directly calling saveFile
    const saveEvent = new CustomEvent("saveFile", {
      detail: {
        name: fileName,
        path: filePath,
        content: content,
        icon: "/icons/file-text.png",
        isDirectory: false,
      },
    });
    window.dispatchEvent(saveEvent);

    // Store content in case app crashes
    localStorage.setItem(APP_STORAGE_KEYS.textedit.CONTENT, content);
    // Store the file path for next time
    localStorage.setItem(APP_STORAGE_KEYS.textedit.LAST_FILE_PATH, filePath);
    setCurrentFilePath(filePath);
    setHasUnsavedChanges(false);
    setIsSaveDialogOpen(false);
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file && editor) {
      const text = await file.text();

      // Convert content based on file type
      let content;
      if (file.name.endsWith(".html")) {
        content = text;
      } else if (file.name.endsWith(".md")) {
        content = markdownToHtml(text);
      } else {
        content = `<p>${text}</p>`;
      }

      editor.commands.setContent(content);
      const filePath = `/Documents/${file.name}`;

      // Dispatch saveFile event instead of directly calling saveFile
      const saveEvent = new CustomEvent("saveFile", {
        detail: {
          name: file.name,
          path: filePath,
          content: JSON.stringify(editor.getJSON()),
          icon: "/icons/file-text.png",
          isDirectory: false,
        },
      });
      window.dispatchEvent(saveEvent);

      setCurrentFilePath(filePath);
      setHasUnsavedChanges(false);
      // Store content in case app crashes
      localStorage.setItem(APP_STORAGE_KEYS.textedit.CONTENT, editor.getHTML());
      // Store the file path for next time
      localStorage.setItem(APP_STORAGE_KEYS.textedit.LAST_FILE_PATH, filePath);
    }
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExportFile = (format: "html" | "md" | "txt") => {
    if (!editor) return;

    const html = editor.getHTML();
    let content: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case "md":
        content = htmlToMarkdown(html);
        mimeType = "text/markdown";
        extension = "md";
        break;
      case "txt":
        content = htmlToPlainText(html);
        mimeType = "text/plain";
        extension = "txt";
        break;
      case "html":
      default:
        content = html;
        mimeType = "text/html";
        extension = "html";
        break;
    }

    // Use "Untitled" as default name for unsaved files
    const filename = currentFilePath
      ? removeFileExtension(currentFilePath.split("/").pop() || "")
      : "Untitled";

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = () => {
    launchApp("finder", { initialPath: "/Documents" });
  };

  // Function to handle dropped files
  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files[0];
    if (file && editor) {
      // Only accept text and markdown files
      if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
        return;
      }

      const text = await file.text();

      // Convert content based on file type
      let content;
      if (file.name.endsWith(".html")) {
        content = text;
      } else if (file.name.endsWith(".md")) {
        content = markdownToHtml(text);
      } else {
        content = `<p>${text}</p>`;
      }

      // If there are unsaved changes, prompt the user
      if (hasUnsavedChanges) {
        setIsConfirmNewDialogOpen(true);
        // Store the dropped file temporarily
        localStorage.setItem(
          "pending_file_open",
          JSON.stringify({
            path: `/Documents/${file.name}`,
            content: content,
          })
        );
      } else {
        editor.commands.clearContent();
        editor.commands.setContent(content);
        const filePath = `/Documents/${file.name}`;

        // Dispatch saveFile event instead of directly calling saveFile
        const saveEvent = new CustomEvent("saveFile", {
          detail: {
            name: file.name,
            path: filePath,
            content: JSON.stringify(editor.getJSON()),
            icon: "/icons/file-text.png",
            isDirectory: false,
          },
        });
        window.dispatchEvent(saveEvent);

        setCurrentFilePath(filePath);
        setHasUnsavedChanges(false);
        // Store content in case app crashes
        localStorage.setItem(
          APP_STORAGE_KEYS.textedit.CONTENT,
          JSON.stringify(editor.getJSON())
        );
        // Store the file path for next time
        localStorage.setItem(
          APP_STORAGE_KEYS.textedit.LAST_FILE_PATH,
          filePath
        );
      }
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".txt,.html,.md,.rtf,.doc,.docx"
        className="hidden"
      />
      <TextEditMenuBar
        editor={editor}
        onClose={onClose}
        isWindowOpen={isWindowOpen}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        onNewFile={handleNewFile}
        onImportFile={handleImportFile}
        onExportFile={handleExportFile}
        onSave={handleSave}
        hasUnsavedChanges={hasUnsavedChanges}
        currentFilePath={currentFilePath}
        handleFileSelect={handleFileSelect}
      />
      <WindowFrame
        title={
          currentFilePath
            ? `${removeFileExtension(currentFilePath.split("/").pop() || "")}`
            : `Untitled${hasUnsavedChanges ? " •" : ""}`
        }
        onClose={onClose}
        isForeground={isForeground}
        appId="textedit"
      >
        <div className="flex flex-col h-full w-full">
          <div
            className={`flex-1 flex flex-col bg-white relative min-h-0 ${
              isDraggingOver
                ? "after:absolute after:inset-0 after:bg-black/20"
                : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isDraggingOver) setIsDraggingOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Check if we're leaving to a child element
              const relatedTarget = e.relatedTarget as Node | null;
              if (e.currentTarget.contains(relatedTarget)) {
                return;
              }
              setIsDraggingOver(false);
            }}
            onDragEnd={() => setIsDraggingOver(false)}
            onMouseLeave={() => setIsDraggingOver(false)}
            onDrop={handleFileDrop}
          >
            <div className="flex bg-[#c0c0c0] border-b border-black w-full flex-shrink-0">
              <div className="flex px-1 py-1 gap-x-1">
                {/* Text style group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleBold().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/bold-${
                        editor?.isActive("bold") ? "depressed" : "off"
                      }.png`}
                      alt="Bold"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleItalic().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/italic-${
                        editor?.isActive("italic") ? "depressed" : "off"
                      }.png`}
                      alt="Italic"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleUnderline().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/underline-${
                        editor?.isActive("underline") ? "depressed" : "off"
                      }.png`}
                      alt="Underline"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Heading selector */}
                <div className="flex">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="w-[80px] h-[22px] flex items-center justify-between px-2 bg-white border border-[#808080] text-sm">
                        {editor?.isActive("heading", { level: 1 })
                          ? "H1"
                          : editor?.isActive("heading", { level: 2 })
                          ? "H2"
                          : editor?.isActive("heading", { level: 3 })
                          ? "H3"
                          : "Text"}
                        <ChevronDown className="ml-1 h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[80px]">
                      <DropdownMenuItem
                        onClick={() =>
                          editor?.chain().focus().setParagraph().run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("paragraph") ? "bg-gray-200" : ""
                        }`}
                      >
                        Text
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 1 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 1 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H1
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 2 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 2 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H2
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 3 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 3 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H3
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Alignment group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("left").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-left-${
                        editor?.isActive({ textAlign: "left" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Left"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("center").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-center-${
                        editor?.isActive({ textAlign: "center" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Center"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("right").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-right-${
                        editor?.isActive({ textAlign: "right" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Right"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* List group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleBulletList().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/unordered-list-${
                        editor?.isActive("bulletList") ? "depressed" : "off"
                      }.png`}
                      alt="Bullet List"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleOrderedList().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/ordered-list-${
                        editor?.isActive("orderedList") ? "depressed" : "off"
                      }.png`}
                      alt="Ordered List"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Voice transcription */}
                <div className="flex">
                  <AudioInputButton
                    onTranscriptionComplete={handleTranscriptionComplete}
                    onTranscriptionStart={handleTranscriptionStart}
                    isLoading={isTranscribing}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                    silenceThreshold={10000}
                  />
                </div>
              </div>
            </div>
            <EditorContent
              editor={editor}
              className="flex-1 overflow-y-auto w-full min-h-0"
            />
          </div>
          <InputDialog
            isOpen={isSaveDialogOpen}
            onOpenChange={setIsSaveDialogOpen}
            onSubmit={handleSaveSubmit}
            title="Save File"
            description="Enter a name for your file"
            value={saveFileName}
            onChange={setSaveFileName}
          />
          <ConfirmDialog
            isOpen={isConfirmNewDialogOpen}
            onOpenChange={setIsConfirmNewDialogOpen}
            onConfirm={() => {
              createNewFile();
              setIsConfirmNewDialogOpen(false);
            }}
            title="Discard Changes"
            description="Do you want to discard your changes and create a new file?"
          />
          <HelpDialog
            isOpen={isHelpDialogOpen}
            onOpenChange={setIsHelpDialogOpen}
            helpItems={helpItems}
            appName="TextEdit"
          />
          <AboutDialog
            isOpen={isAboutDialogOpen}
            onOpenChange={setIsAboutDialogOpen}
            metadata={appMetadata}
          />
        </div>
      </WindowFrame>
    </>
  );
}
