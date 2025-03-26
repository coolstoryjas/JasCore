import { useState, useEffect, useCallback, useRef } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ChatsMenuBar } from "./ChatsMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { helpItems, appMetadata } from "..";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useChat } from "ai/react";
import {
  loadChatMessages,
  saveChatMessages,
  APP_STORAGE_KEYS,
  getSystemState,
} from "@/utils/storage";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { useAppContext } from "@/contexts/AppContext";
import { FileText } from "lucide-react";
import { AppId } from "@/config/appRegistry";

// Define types for TextEdit content structure
interface TextNode {
  text?: string;
  // Using Record instead of any for better type safety
  [key: string]: unknown;
}

interface ContentNode {
  type: string;
  content?: Array<TextNode | ContentNode>;
  attrs?: NodeAttributes;
  [key: string]: unknown;
}

interface TextEditContent {
  content?: ContentNode[];
  // Using Record instead of any for better type safety
  [key: string]: unknown;
}

// Define additional types for document formatting
interface FormattingPatterns {
  nodeTypes: Record<string, number>;
  headingLevels: Set<number>;
  hasBulletLists: boolean;
  hasNumberedLists: boolean;
  hasCodeBlocks: boolean;
  codeLanguages: Set<string>;
  hasTaskLists: boolean;
  hasRichTextFormatting: boolean;
}

interface NodeAttributes {
  level?: number;
  language?: string;
  checked?: boolean;
  [key: string]: unknown;
}

// Define types for app control markup
interface AppControlOperation {
  type: "launch" | "close";
  id: string;
}

// Helper function to parse app control markup
const parseAppControlMarkup = (message: string): AppControlOperation[] => {
  const operations: AppControlOperation[] = [];

  try {
    // Find all app control tags
    const launchRegex = /<app:launch\s+id\s*=\s*"([^"]+)"\s*\/>/g;
    const closeRegex = /<app:close\s+id\s*=\s*"([^"]+)"\s*\/>/g;

    // Find all launch operations
    let match;
    while ((match = launchRegex.exec(message)) !== null) {
      operations.push({
        type: "launch",
        id: match[1],
      });
    }

    // Find all close operations
    while ((match = closeRegex.exec(message)) !== null) {
      operations.push({
        type: "close",
        id: match[1],
      });
    }
  } catch (error) {
    console.error("Error parsing app control markup:", error);
  }

  return operations;
};

// Helper function to clean app control markup from message
const cleanAppControlMarkup = (message: string): string => {
  // Replace launch tags with human readable text
  message = message.replace(
    /<app:launch\s+id\s*=\s*"([^"]+)"\s*\/>/g,
    (_match, id) => `*opened ${id}*`
  );

  // Replace close tags with human readable text
  message = message.replace(
    /<app:close\s+id\s*=\s*"([^"]+)"\s*\/>/g,
    (_match, id) => `*closed ${id}*`
  );

  return message.trim();
};

// Helper function to extract text from TextEdit JSON content
const extractTextFromTextEditContent = (content: string): string => {
  try {
    const jsonContent = JSON.parse(content) as TextEditContent;
    if (!jsonContent.content) return "";

    return jsonContent.content
      .map((node: ContentNode) => {
        // Convert different node types to their text representation
        let level: number;
        let language: string;
        let isChecked: boolean | undefined;
        let checkMark: string;

        switch (node.type) {
          case "paragraph":
            return extractTextFromContentNode(node);

          case "heading":
            level = (node.attrs as NodeAttributes)?.level || 1;
            return "#".repeat(level) + " " + extractTextFromContentNode(node);

          case "codeBlock":
            language = (node.attrs as NodeAttributes)?.language || "";
            return (
              "```" +
              language +
              "\n" +
              extractTextFromContentNode(node) +
              "\n```"
            );

          case "horizontalRule":
            return "---";

          case "bulletList":
            if (!node.content) return "";
            return node.content
              .filter((item): item is ContentNode => "type" in item) // Filter to ensure we only have ContentNodes
              .map((item: ContentNode) => {
                // Process each list item
                if (item.type === "listItem" && item.content) {
                  // Get the first paragraph of the list item
                  const paragraph = item.content.find(
                    (n): n is ContentNode =>
                      "type" in n && n.type === "paragraph"
                  );
                  if (paragraph) {
                    return "- " + extractTextFromContentNode(paragraph);
                  }
                }
                return "- ";
              })
              .join("\n");

          case "orderedList":
            if (!node.content) return "";
            return node.content
              .filter((item): item is ContentNode => "type" in item) // Filter to ensure we only have ContentNodes
              .map((item: ContentNode, i: number) => {
                // Process each list item
                if (item.type === "listItem" && item.content) {
                  // Get the first paragraph of the list item
                  const paragraph = item.content.find(
                    (n): n is ContentNode =>
                      "type" in n && n.type === "paragraph"
                  );
                  if (paragraph) {
                    return `${i + 1}. ` + extractTextFromContentNode(paragraph);
                  }
                }
                return `${i + 1}. `;
              })
              .join("\n");

          case "taskList":
          case "taskItem":
            isChecked = (node.attrs as NodeAttributes)?.checked;
            checkMark = isChecked ? "[x]" : "[ ]";

            if (node.type === "taskList" && node.content) {
              return node.content
                .filter((item): item is ContentNode => "type" in item) // Filter to ensure we only have ContentNodes
                .map((item: ContentNode) => {
                  const itemChecked = (item.attrs as NodeAttributes)?.checked;
                  const itemMark = itemChecked ? "[x]" : "[ ]";

                  const paragraph = item.content?.find(
                    (n): n is ContentNode =>
                      "type" in n && n.type === "paragraph"
                  );

                  if (paragraph) {
                    return (
                      "- " +
                      itemMark +
                      " " +
                      extractTextFromContentNode(paragraph)
                    );
                  }
                  return "- " + itemMark + " ";
                })
                .join("\n");
            } else if (node.type === "taskItem" && node.content) {
              const paragraph = node.content.find(
                (n): n is ContentNode => "type" in n && n.type === "paragraph"
              );

              if (paragraph) {
                return (
                  "- " + checkMark + " " + extractTextFromContentNode(paragraph)
                );
              }
              return "- " + checkMark + " ";
            }
            return "";

          case "blockquote":
            if (!node.content) return "";
            return node.content
              .filter((item): item is ContentNode => "type" in item) // Filter to ensure we only have ContentNodes
              .map((n: ContentNode) => "> " + extractTextFromContentNode(n))
              .join("\n");

          default:
            return extractTextFromContentNode(node);
        }
      })
      .join("\n");
  } catch (error) {
    console.error("Error extracting text from TextEdit content:", error);
    // If not valid JSON or other error, return as is
    return content;
  }
};

// Helper function to extract text from a content node
const extractTextFromContentNode = (node: ContentNode): string => {
  if (!node.content) return "";

  return node.content
    .map((textNode: TextNode) => {
      let text = textNode.text || "";

      // If this node has marks, add appropriate markdown formatting
      if (
        textNode.marks &&
        Array.isArray(textNode.marks) &&
        textNode.marks.length > 0
      ) {
        textNode.marks.forEach((mark) => {
          switch (mark.type) {
            case "bold":
              text = `**${text}**`;
              break;
            case "italic":
              text = `*${text}*`;
              break;
            case "code":
              text = `\`${text}\``;
              break;
            case "strike":
              text = `~~${text}~~`;
              break;
            case "link":
              if (mark.attrs && mark.attrs.href) {
                text = `[${text}](${mark.attrs.href})`;
              }
              break;
          }
        });
      }

      return text;
    })
    .join("");
};

// Helper function to truncate filename
const truncateFilename = (filename: string, maxLength: number = 20): string => {
  if (filename.length <= maxLength) return filename;

  // Get file extension
  const lastDotIndex = filename.lastIndexOf(".");
  const extension = lastDotIndex !== -1 ? filename.slice(lastDotIndex) : "";

  // Calculate how much of the name we can keep
  const nameLength = maxLength - extension.length - 3; // 3 for the ellipsis

  if (nameLength <= 0) {
    // If the extension is too long, just truncate the whole thing
    return filename.slice(0, maxLength - 3) + "...";
  }

  // Truncate the name part but keep the extension
  const namePart = filename.slice(
    0,
    lastDotIndex !== -1 ? lastDotIndex : filename.length
  );
  return namePart.slice(0, nameLength) + "..." + extension;
};

// Function to parse TextEdit XML markup in chat messages
const parseTextEditMarkup = (message: string) => {
  const edits: {
    type: "insert" | "replace" | "delete";
    line: number;
    count?: number;
    content?: string;
  }[] = [];

  try {
    // Trim message to ensure clean parsing
    if (!message || typeof message !== "string") {
      console.warn("Invalid message format for parsing");
      return edits;
    }

    const trimmedMessage = message.trim();

    // Log the original message for debugging
    console.log(
      "Parsing TextEdit markup from message:",
      trimmedMessage.substring(0, 100) + "..."
    );

    // First, check if we have equal number of opening and closing tags
    const openingInsertTags = (
      trimmedMessage.match(/<textedit:insert[^>]*>/g) || []
    ).length;
    const closingInsertTags = (
      trimmedMessage.match(/<\/textedit:insert>/g) || []
    ).length;
    const selfClosingDeleteTags = (
      trimmedMessage.match(/<textedit:delete[^>]*\/>/g) || []
    ).length;
    const openingReplaceTags = (
      trimmedMessage.match(/<textedit:replace[^>]*>/g) || []
    ).length;
    const closingReplaceTags = (
      trimmedMessage.match(/<\/textedit:replace>/g) || []
    ).length;

    console.log(`Tag check: 
      - Insert: ${openingInsertTags} opening, ${closingInsertTags} closing
      - Replace: ${openingReplaceTags} opening, ${closingReplaceTags} closing
      - Delete: ${selfClosingDeleteTags} self-closing`);

    if (
      openingInsertTags !== closingInsertTags ||
      openingReplaceTags !== closingReplaceTags
    ) {
      console.warn("Unbalanced XML tags detected, may get incomplete results");
    }

    // Regular expressions to match the XML tags - more robust with whitespace handling
    const insertRegex =
      /<textedit:insert\s+line\s*=\s*"(\d+)"\s*>([\s\S]*?)<\/textedit:insert>/g;
    const replaceRegex =
      /<textedit:replace\s+line\s*=\s*"(\d+)"(?:\s+count\s*=\s*"(\d+)")?\s*>([\s\S]*?)<\/textedit:replace>/g;
    const deleteRegex =
      /<textedit:delete\s+line\s*=\s*"(\d+)"(?:\s+count\s*=\s*"(\d+)")?\s*\/>/g;

    // Reset the lastIndex property for all regex patterns
    insertRegex.lastIndex = 0;
    replaceRegex.lastIndex = 0;
    deleteRegex.lastIndex = 0;

    // Find all insertions
    const allInsertions = Array.from(trimmedMessage.matchAll(insertRegex))
      .map((match) => {
        const lineNumber = parseInt(match[1], 10);
        return {
          type: "insert" as const,
          line: lineNumber,
          content: match[2],
        };
      })
      .filter((edit) => edit.line > 0);

    // Find all replacements
    const allReplacements = Array.from(trimmedMessage.matchAll(replaceRegex))
      .map((match) => {
        const lineNumber = parseInt(match[1], 10);
        const count = match[2] ? parseInt(match[2], 10) : 1;
        return {
          type: "replace" as const,
          line: lineNumber,
          count: count,
          content: match[3],
        };
      })
      .filter((edit) => edit.line > 0 && (edit.count || 1) > 0);

    // Find all deletions
    const allDeletions = Array.from(trimmedMessage.matchAll(deleteRegex))
      .map((match) => {
        const lineNumber = parseInt(match[1], 10);
        const count = match[2] ? parseInt(match[2], 10) : 1;
        return {
          type: "delete" as const,
          line: lineNumber,
          count: count,
        };
      })
      .filter((edit) => edit.line > 0 && (edit.count || 1) > 0);

    // Add all edits to the result array
    edits.push(...allInsertions, ...allReplacements, ...allDeletions);

    console.log(`Successfully parsed:
      - ${allInsertions.length} insertions
      - ${allReplacements.length} replacements
      - ${allDeletions.length} deletions`);

    // Log the edits for debugging
    if (edits.length > 0) {
      console.log(
        "Detected TextEdit markup edits:",
        JSON.stringify(edits, null, 2)
      );
    } else {
      console.warn("No valid edits found despite matching regex patterns");
    }
  } catch (error) {
    console.error("Error parsing TextEdit markup:", error);
  }

  return edits;
};

// Define the type for text edit operations
type TextEditOperation = {
  type: "insert" | "replace" | "delete";
  line: number;
  count?: number;
  content?: string;
};

// Function to apply edits to TextEdit content
const applyTextEditChanges = (content: string, edits: TextEditOperation[]) => {
  if (!edits.length) return content;

  // Split content into lines for easier processing
  const lines = content.split("\n");
  console.log(`Document has ${lines.length} lines before applying edits`);

  // Create a copy of edits to avoid modifying the original array
  const editsCopy = [...edits];

  // Sort edits by line number in ascending order to process them sequentially
  editsCopy.sort((a, b) => a.line - b.line);

  console.log("Processing edits in order:", JSON.stringify(editsCopy, null, 2));

  // Apply each edit and track line number changes
  for (let i = 0; i < editsCopy.length; i++) {
    const edit = editsCopy[i];
    let lineIndex = edit.line - 1; // Convert to 0-indexed, make mutable

    // Track how many lines were added or removed by this edit
    let lineCountChange = 0;

    // Validate line numbers before applying edits
    if (
      edit.type === "insert" &&
      (lineIndex < 0 || lineIndex > lines.length + 1)
    ) {
      console.warn(
        `Invalid insert line number ${edit.line} (document has ${lines.length} lines)`
      );
      continue;
    } else if (
      (edit.type === "replace" || edit.type === "delete") &&
      (lineIndex < 0 || lineIndex >= lines.length)
    ) {
      console.warn(
        `Invalid ${edit.type} line number ${edit.line} (document has ${lines.length} lines)`
      );
      continue;
    }

    console.log(`Applying edit #${i + 1}: ${edit.type} at line ${edit.line}`);

    switch (edit.type) {
      case "insert":
        if (edit.content) {
          const newLines = edit.content.split("\n");
          console.log(
            `Inserting ${newLines.length} line(s) at line ${edit.line} (index ${lineIndex})`
          );
          console.log(`Original document has ${lines.length} lines`);

          // Adjust lineIndex if it's beyond the current document length
          if (lineIndex > lines.length) {
            console.log(
              `Adjusting lineIndex from ${lineIndex} to ${lines.length} (end of document)`
            );
            lineIndex = lines.length;
          }

          // Show what the insertion point looks like
          if (lineIndex < lines.length) {
            console.log(`Inserting before: "${lines[lineIndex]}"`);
          } else {
            console.log(`Inserting at end of document`);
          }

          // Insert the new lines at the specified index
          lines.splice(lineIndex, 0, ...newLines);

          // Track how many lines were added
          lineCountChange = newLines.length;
          console.log(`After insert, document now has ${lines.length} lines`);

          // Log a snippet of the document after insertion
          console.log(
            `Document after insert: "${lines
              .slice(
                Math.max(0, lineIndex - 1),
                Math.min(lineIndex + newLines.length + 1, lines.length)
              )
              .join("\n")}"`
          );
        } else {
          console.warn(`Insert operation at line ${edit.line} has no content`);
        }
        break;

      case "replace":
        if (edit.content) {
          const count = Math.min(edit.count || 1, lines.length - lineIndex);
          const newLines = edit.content.split("\n");
          console.log(
            `Replacing ${count} line(s) at line ${edit.line} with ${newLines.length} new line(s)`
          );
          console.log(`Content to replace with: "${edit.content}"`);
          console.log(
            `Lines being replaced: "${lines
              .slice(lineIndex, lineIndex + count)
              .join("\n")}"`
          );

          // Detailed logging of the replacement operation
          console.log(`Before replace: Document has ${lines.length} lines`);
          console.log(
            `Replace at index ${lineIndex} (line ${edit.line}), count: ${count}`
          );
          console.log(`New content has ${newLines.length} lines`);

          // Ensure we're not trying to replace beyond the end of the document
          if (lineIndex >= lines.length) {
            console.warn(
              `Replace operation at line ${edit.line} is beyond end of document (${lines.length} lines)`
            );
            // Adjust to replace the last line instead
            lineIndex = Math.max(0, lines.length - 1);
            console.log(
              `Adjusted replace to operate on line ${lineIndex + 1} instead`
            );
          }

          // Perform the replacement
          lines.splice(lineIndex, count, ...newLines);

          // Track how many lines were added or removed
          lineCountChange = newLines.length - count;
          console.log(`Line count change: ${lineCountChange}`);
          console.log(`After replace: Document now has ${lines.length} lines`);
          console.log(
            `Document content after replace: "${lines
              .slice(0, Math.min(5, lines.length))
              .join("\n")}${lines.length > 5 ? "..." : ""}"`
          );
        } else {
          console.warn(`Replace operation at line ${edit.line} has no content`);
        }
        break;

      case "delete":
        {
          const count = Math.min(edit.count || 1, lines.length - lineIndex);
          console.log(`Deleting ${count} line(s) at line ${edit.line}`);

          lines.splice(lineIndex, count);

          // Track how many lines were removed
          lineCountChange = -count;
          console.log(`After delete, document now has ${lines.length} lines`);
        }
        break;
    }

    // If we added or removed lines, adjust the line numbers of subsequent edits
    if (lineCountChange !== 0) {
      console.log(
        `Edit at line ${edit.line} changed line count by ${lineCountChange}`
      );

      // Update line numbers for all subsequent edits
      for (let j = i + 1; j < editsCopy.length; j++) {
        // Only adjust if the edit is AFTER the current edit's line
        // For insertions, this means line numbers greater than the insertion point
        // For replacements and deletions, this means line numbers greater than the last line affected
        const adjustmentThreshold =
          edit.type === "replace" || edit.type === "delete"
            ? edit.line + (edit.count || 1) - 1 // Last line affected by replace/delete
            : edit.line; // Line at which insertion occurred

        if (editsCopy[j].line > adjustmentThreshold) {
          const originalLine = editsCopy[j].line;
          editsCopy[j].line += lineCountChange;
          console.log(
            `Adjusted edit #${j + 1} (${
              editsCopy[j].type
            }) from line ${originalLine} to new line ${editsCopy[j].line}`
          );

          // Validate the adjusted line number
          if (editsCopy[j].line <= 0) {
            console.warn(
              `Edit #${j + 1} has invalid line number after adjustment: ${
                editsCopy[j].line
              }, setting to 1`
            );
            editsCopy[j].line = 1;
          } else if (
            editsCopy[j].type !== "insert" &&
            editsCopy[j].line > lines.length
          ) {
            console.warn(
              `Edit #${j + 1} (${editsCopy[j].type}) has line number ${
                editsCopy[j].line
              } after adjustment, but document only has ${lines.length} lines`
            );
            // For non-insert operations, we need to ensure the line exists
            if (
              editsCopy[j].type === "replace" ||
              editsCopy[j].type === "delete"
            ) {
              console.warn(
                `Adjusting edit #${j + 1} line number to ${lines.length}`
              );
              editsCopy[j].line = Math.max(1, lines.length);
            }
          }
        }
      }
    }
  }

  console.log(`Final document has ${lines.length} lines after all edits`);

  // Join lines back into a single string
  return lines.join("\n");
};

// Test function to diagnose replace operations
const testReplaceOperations = () => {
  console.log("=== TESTING REPLACE OPERATIONS ===");

  // Original content
  const originalContent =
    "how sweet\n多麼甜美\nin the quiet of the night, thoughts take flight\n在寂靜的夜晚，思緒翱翔\nwhispers of dreams, in the soft moonlight\n夢的呢喃，在柔和的月光下";
  console.log("Original content:", originalContent);

  // Test message with multiple replace operations - fixed to use proper line numbers
  const testMessage = `<textedit:replace line="1" count="2">how sweet
多麼甜美</textedit:replace>
<textedit:replace line="3" count="2">in the quiet of the night, thoughts take flight
在寂靜的夜晚，思緒翱翔</textedit:replace>
<textedit:replace line="5" count="2">whispers of dreams, in the soft moonlight
夢的呢喃，在柔和的月光下</textedit:replace>`;

  console.log("Test message:", testMessage);

  // Parse the edits
  const edits = parseTextEditMarkup(testMessage);
  console.log("Parsed edits:", JSON.stringify(edits, null, 2));

  // Apply the edits
  const newContent = applyTextEditChanges(originalContent, edits);
  console.log("New content:", newContent);

  // Test the document structure creation
  try {
    // Get current content as JSON
    const contentJson = localStorage.getItem(APP_STORAGE_KEYS.textedit.CONTENT);
    if (contentJson) {
      console.log("Testing document structure creation...");
      const paragraphs = newContent.split("\n");
      console.log("Paragraphs:", paragraphs);

      // Create a simple document structure
      const testDoc = {
        type: "doc",
        content: paragraphs.map((paragraph) => ({
          type: "paragraph",
          content: paragraph.trim()
            ? [{ type: "text", text: paragraph }]
            : [{ type: "text", text: " " }], // Use space for empty paragraphs
        })),
      };

      console.log("Test document structure:", JSON.stringify(testDoc, null, 2));

      // This would normally update localStorage, but we're just testing
      console.log("Document structure test complete");
    }
  } catch (error) {
    console.error("Error testing document structure:", error);
  }

  console.log("=== TEST COMPLETE ===");
  return newContent;
};

// Helper function to test with user's specific content
const testWithUserContent = (content: string) => {
  console.log("=== TESTING WITH USER CONTENT ===");
  console.log("Original content:", content);

  // Test message with multiple replace operations for bilingual content
  const testMessage = `<textedit:replace line="1" count="2">how sweet
多麼甜美</textedit:replace>
<textedit:replace line="3" count="2">in the quiet of the night, thoughts take flight
在寂靜的夜晚，思緒翱翔</textedit:replace>
<textedit:replace line="5" count="2">whispers of dreams, in the soft moonlight
夢的呢喃，在柔和的月光下</textedit:replace>`;

  // Parse the edits
  const edits = parseTextEditMarkup(testMessage);
  console.log("Parsed edits:", JSON.stringify(edits, null, 2));

  // Apply the edits
  const newContent = applyTextEditChanges(content, edits);
  console.log("New content:", newContent);

  // Test updating the document
  try {
    // Create a document structure
    const paragraphs = newContent.split("\n");
    const testDoc = {
      type: "doc",
      content: paragraphs.map((paragraph) => ({
        type: "paragraph",
        content: paragraph.trim()
          ? [{ type: "text", text: paragraph }]
          : [{ type: "text", text: " " }], // Use space for empty paragraphs
      })),
    };

    console.log("Document structure:", JSON.stringify(testDoc, null, 2));

    // This would normally update the document
    console.log("Test complete - document structure is valid");
    return testDoc;
  } catch (error) {
    console.error("Error creating document structure:", error);
    return null;
  }
};

// Expose test functions to window for debugging
// @ts-expect-error - Intentionally exposing function to window for debugging
window.testReplaceOperations = testReplaceOperations;
// @ts-expect-error - Intentionally exposing function to window for debugging
window.testWithUserContent = testWithUserContent;

// Uncomment to run the test
// window.addEventListener('load', () => setTimeout(testReplaceOperations, 2000));

// Add a markdown parser function
const parseMarkdown = (text: string): ContentNode[] => {
  // Simple markdown parsing for common elements
  // This is a basic implementation - you might want to use a more robust markdown parser

  // Process the text line by line
  const lines = text.split("\n");
  const nodes: ContentNode[] = [];

  let inCodeBlock = false;
  let codeBlockContent = "";
  let codeBlockLanguage = "";
  let inBulletList = false;
  let bulletListItems: ContentNode[] = [];
  let inOrderedList = false;
  let orderedListItems: ContentNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check for code blocks
    if (trimmedLine.startsWith("```")) {
      if (!inCodeBlock) {
        // Start of code block
        inCodeBlock = true;
        codeBlockLanguage = trimmedLine.slice(3).trim();
        codeBlockContent = "";
        continue;
      } else {
        // End of code block
        inCodeBlock = false;
        nodes.push({
          type: "codeBlock",
          attrs: { language: codeBlockLanguage || "text" },
          content: [{ type: "text", text: codeBlockContent }],
        });
        continue;
      }
    }

    // If we're in a code block, add the line to the code block content
    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? "\n" : "") + line;
      continue;
    }

    // Check for task list items
    const taskListMatch = trimmedLine.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (taskListMatch) {
      const isChecked = taskListMatch[1].toLowerCase() === "x";
      const taskText = taskListMatch[2];

      nodes.push({
        type: "taskItem",
        attrs: { checked: isChecked },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: taskText }],
          },
        ],
      });
      continue;
    }

    // Check for bullet list items
    if (trimmedLine.match(/^[-*]\s+(.+)$/)) {
      const bulletContent = trimmedLine.replace(/^[-*]\s+/, "");

      if (!inBulletList) {
        // Start a new bullet list
        inBulletList = true;
        bulletListItems = [];
      }

      // Add this item to the bullet list
      bulletListItems.push({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: processInlineMarkdown(bulletContent),
          },
        ],
      });
      continue;
    } else if (inBulletList) {
      // End of bullet list
      nodes.push({
        type: "bulletList",
        content: bulletListItems,
      });
      inBulletList = false;
      bulletListItems = [];
    }

    // Check for ordered list items
    const orderedListMatch = trimmedLine.match(/^(\d+)[.)]\s+(.+)$/);
    if (orderedListMatch) {
      const itemContent = orderedListMatch[2];

      if (!inOrderedList) {
        // Start a new ordered list
        inOrderedList = true;
        orderedListItems = [];
      }

      // Add this item to the ordered list
      orderedListItems.push({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: processInlineMarkdown(itemContent),
          },
        ],
      });
      continue;
    } else if (inOrderedList) {
      // End of ordered list
      nodes.push({
        type: "orderedList",
        content: orderedListItems,
      });
      inOrderedList = false;
      orderedListItems = [];
    }

    // Check for headings (# Heading)
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      nodes.push({
        type: "heading",
        attrs: { level },
        content: processInlineMarkdown(content),
      });
      continue;
    }

    // Check for horizontal rule
    if (trimmedLine.match(/^(\*{3,}|-{3,}|_{3,})$/)) {
      nodes.push({
        type: "horizontalRule",
      });
      continue;
    }

    // Check for blockquotes
    if (trimmedLine.startsWith(">")) {
      const quoteContent = trimmedLine.substring(1).trim();
      nodes.push({
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: processInlineMarkdown(quoteContent),
          },
        ],
      });
      continue;
    }

    // Skip processing if the line is empty
    if (!trimmedLine) {
      nodes.push({
        type: "paragraph",
        content: [{ type: "text", text: " " }],
      });
      continue;
    }

    // Process the line for inline formatting
    const inlineContent = processInlineMarkdown(trimmedLine);

    nodes.push({
      type: "paragraph",
      content:
        inlineContent.length > 0
          ? inlineContent
          : [{ type: "text", text: trimmedLine }],
    });
  }

  // Add any remaining lists
  if (inBulletList && bulletListItems.length > 0) {
    nodes.push({
      type: "bulletList",
      content: bulletListItems,
    });
  }

  if (inOrderedList && orderedListItems.length > 0) {
    nodes.push({
      type: "orderedList",
      content: orderedListItems,
    });
  }

  // If we ended while still in a code block, add it
  if (inCodeBlock) {
    nodes.push({
      type: "codeBlock",
      attrs: { language: codeBlockLanguage || "text" },
      content: [{ type: "text", text: codeBlockContent }],
    });
  }

  return nodes;
};

// Helper function to process inline markdown formatting
const processInlineMarkdown = (text: string): TextNode[] => {
  const result: TextNode[] = [];

  // Regular expressions for inline formatting
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, mark: "bold" }, // **bold**
    { regex: /\*(.+?)\*/g, mark: "italic" }, // *italic*
    { regex: /_(.+?)_/g, mark: "italic" }, // _italic_
    { regex: /`(.+?)`/g, mark: "code" }, // `code`
    { regex: /~~(.+?)~~/g, mark: "strike" }, // ~~strikethrough~~
    { regex: /\[(.+?)\]\((.+?)\)/g, mark: "link" }, // [text](url)
  ];

  // Find all matches for all patterns
  const allMatches: Array<{
    start: number;
    end: number;
    content: string;
    mark: string;
    url?: string;
  }> = [];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      // For links, we need to store the URL as well
      if (pattern.mark === "link") {
        allMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[1], // Link text
          mark: pattern.mark,
          url: match[2], // Link URL
        });
      } else {
        allMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[1],
          mark: pattern.mark,
        });
      }
    }
  });

  // Sort matches by start position
  allMatches.sort((a, b) => a.start - b.start);

  // Check for overlapping matches and remove inner matches
  for (let i = 0; i < allMatches.length - 1; i++) {
    for (let j = i + 1; j < allMatches.length; j++) {
      if (allMatches[j].start < allMatches[i].end) {
        // Matches overlap, remove the later one
        allMatches.splice(j, 1);
        j--;
      }
    }
  }

  // Process the text with the non-overlapping matches
  let currentPosition = 0;

  for (const match of allMatches) {
    // Add any text before this match
    if (match.start > currentPosition) {
      result.push({
        type: "text",
        text: text.substring(currentPosition, match.start),
      });
    }

    // Add the formatted text
    if (match.mark === "link") {
      result.push({
        type: "text",
        marks: [{ type: "link", attrs: { href: match.url } }],
        text: match.content,
      });
    } else {
      result.push({
        type: "text",
        marks: [{ type: match.mark }],
        text: match.content,
      });
    }

    currentPosition = match.end;
  }

  // Add any remaining text
  if (currentPosition < text.length) {
    result.push({
      type: "text",
      text: text.substring(currentPosition),
    });
  }

  return result;
};

// Function to update TextEdit content in localStorage
const updateTextEditContent = (newContent: string) => {
  try {
    // Get current content as JSON
    const contentJson = localStorage.getItem(APP_STORAGE_KEYS.textedit.CONTENT);
    if (!contentJson) return false;

    // Get the current file path
    const currentFilePath = localStorage.getItem(
      APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
    );
    if (!currentFilePath) return false;

    // Parse the JSON content and save the original structure
    const jsonContent = JSON.parse(contentJson) as TextEditContent;
    const originalStructure = JSON.parse(contentJson); // Keep exact original structure

    if (!jsonContent.content) return false;

    // Analyze original structure to preserve formatting patterns
    const formattingPatterns = analyzeDocumentFormatting(jsonContent);
    console.log("Detected formatting patterns:", {
      nodeTypes: formattingPatterns.nodeTypes,
      headingLevels: Array.from(formattingPatterns.headingLevels),
      hasBulletLists: formattingPatterns.hasBulletLists,
      hasNumberedLists: formattingPatterns.hasNumberedLists,
      hasCodeBlocks: formattingPatterns.hasCodeBlocks,
      codeLanguages: Array.from(formattingPatterns.codeLanguages),
      hasTaskLists: formattingPatterns.hasTaskLists,
      hasRichTextFormatting: formattingPatterns.hasRichTextFormatting,
    });

    // Parse markdown content into document nodes, with formatting awareness
    const markdownNodes = parseMarkdownWithFormattingPreservation(
      newContent,
      formattingPatterns
    );

    // Create a deep clone of the original structure to preserve all properties
    const updatedContent = JSON.parse(JSON.stringify(originalStructure));

    // Replace content with markdown-processed nodes
    updatedContent.content = markdownNodes;

    // Convert to JSON string
    const jsonString = JSON.stringify(updatedContent);

    console.log("Prepared updated content for TextEdit", {
      filePath: currentFilePath,
      contentNodes: markdownNodes.length,
      contentStructure: {
        type: updatedContent.type,
        contentLength: updatedContent.content?.length || 0,
      },
    });

    // Update the document in TextEdit directly using the same event it uses
    // This ensures we're working with TextEdit's expected file handling mechanism
    const fileName = currentFilePath.split("/").pop() || "Untitled";

    // First update localStorage directly to ensure consistency
    localStorage.setItem(APP_STORAGE_KEYS.textedit.CONTENT, jsonString);

    // New approach: First try to notify TextEdit that file will change
    // This helps with already-opened documents
    window.dispatchEvent(
      new CustomEvent("fileWillChange", {
        detail: {
          path: currentFilePath,
        },
      })
    );

    // Short delay to allow TextEdit to prepare for change
    setTimeout(() => {
      // Then create a saveFile event - this is what TextEdit uses to save files
      const saveEvent = new CustomEvent("saveFile", {
        detail: {
          name: fileName,
          path: currentFilePath,
          content: jsonString,
          icon: "/icons/file-text.png",
          isDirectory: false,
          updateExisting: true,
          skipBackup: true,
        },
      });

      console.log(
        "Dispatching saveFile event to update TextEdit document:",
        currentFilePath
      );
      window.dispatchEvent(saveEvent);

      // Wait for the save event to be processed
      setTimeout(() => {
        // Force a content change notification
        window.dispatchEvent(
          new CustomEvent("contentChanged", {
            detail: {
              path: currentFilePath,
              content: jsonString,
            },
          })
        );

        // Dispatch an event to notify TextEdit to reload the document from filesystem
        window.dispatchEvent(
          new CustomEvent("documentUpdated", {
            detail: {
              path: currentFilePath,
              content: jsonString,
            },
          })
        );

        // Force a full document refresh
        setTimeout(() => {
          // Try closing and reopening the document to ensure refresh
          // First try to close it (if it's open)
          window.dispatchEvent(
            new CustomEvent("closeFile", {
              detail: {
                path: currentFilePath,
              },
            })
          );

          // Then reopen it with the updated content
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("openFile", {
                detail: {
                  path: currentFilePath,
                  content: jsonString,
                  forceReload: true,
                },
              })
            );

            // Also try to send a direct update to the editor if possible
            window.dispatchEvent(
              new CustomEvent("updateEditorContent", {
                detail: {
                  path: currentFilePath,
                  content: jsonString,
                },
              })
            );
          }, 50);
        }, 100);
      }, 50);
    }, 50);

    return true;
  } catch (error) {
    console.error("Error updating TextEdit content:", error);
    console.error("Error details:", error);
  }
  return false;
};

// Function to analyze document structure for formatting patterns
const analyzeDocumentFormatting = (
  document: TextEditContent
): FormattingPatterns => {
  const patterns: FormattingPatterns = {
    nodeTypes: {},
    headingLevels: new Set<number>(),
    hasBulletLists: false,
    hasNumberedLists: false,
    hasCodeBlocks: false,
    codeLanguages: new Set<string>(),
    hasTaskLists: false,
    hasRichTextFormatting: false,
  };

  if (!document.content) return patterns;

  // Analyze document structure to identify formatting patterns
  document.content.forEach((node: ContentNode) => {
    // Track node type frequencies
    patterns.nodeTypes[node.type] = (patterns.nodeTypes[node.type] || 0) + 1;

    // Track specific formatting elements
    const attrs = (node.attrs as NodeAttributes) || {};

    if (node.type === "heading" && attrs.level) {
      patterns.headingLevels.add(attrs.level);
    }

    if (node.type === "bulletList") {
      patterns.hasBulletLists = true;
    }

    if (node.type === "orderedList") {
      patterns.hasNumberedLists = true;
    }

    if (node.type === "codeBlock" && attrs.language) {
      patterns.hasCodeBlocks = true;
      patterns.codeLanguages.add(attrs.language);
    }

    if (node.type === "taskList" || node.type === "taskItem") {
      patterns.hasTaskLists = true;
    }

    // Check for rich text in content nodes
    if (node.content) {
      node.content.forEach((textNode: TextNode) => {
        if (
          textNode.marks &&
          Array.isArray(textNode.marks) &&
          textNode.marks.length > 0
        ) {
          patterns.hasRichTextFormatting = true;
        }
      });
    }
  });

  // Convert sets to arrays for easier logging/handling
  return {
    ...patterns,
    // These will be converted back to arrays for logging but kept as sets for processing
  };
};

// Enhanced markdown parser that preserves formatting based on document analysis
const parseMarkdownWithFormattingPreservation = (
  text: string,
  formattingPatterns: FormattingPatterns
): ContentNode[] => {
  // Start with the basic markdown parser
  const baseNodes = parseMarkdown(text);

  // Now enhance the nodes based on detected formatting patterns
  const enhancedNodes = baseNodes.map((node) => {
    // Apply formatting enhancements based on node type
    if (node.type === "paragraph" && formattingPatterns.hasRichTextFormatting) {
      // For paragraphs, we want to enhance with rich text if the original had it
      return enhanceParagraphWithRichText(node);
    }

    // Other node types can have specific enhancements added here

    return node;
  });

  // Add any special node types that might be missing from basic markdown parsing
  if (
    formattingPatterns.hasTaskLists &&
    !enhancedNodes.some((n) => n.type === "taskList" || n.type === "taskItem")
  ) {
    // Look for potential task list items in paragraphs and convert them
    convertPotentialTaskListItems(enhancedNodes);
  }

  return enhancedNodes;
};

// Helper function to enhance paragraphs with rich text formatting
const enhanceParagraphWithRichText = (node: ContentNode): ContentNode => {
  // If node already has rich text formatting, leave it as is
  if (
    node.content?.some(
      (c) => c.marks && Array.isArray(c.marks) && c.marks.length > 0
    )
  ) {
    return node;
  }

  // Otherwise, try to detect and apply common markdown patterns within the paragraph text
  if (
    node.content &&
    node.content.length === 1 &&
    typeof node.content[0].text === "string"
  ) {
    const text = node.content[0].text;
    const inlineContent = processInlineMarkdown(text);

    if (
      inlineContent.length > 1 ||
      (inlineContent.length === 1 && inlineContent[0].marks)
    ) {
      // We detected some inline formatting, apply it
      return {
        ...node,
        content: inlineContent,
      };
    }
  }

  return node;
};

// Helper function to detect and convert potential task list items
const convertPotentialTaskListItems = (nodes: ContentNode[]): void => {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (
      node.type === "paragraph" &&
      node.content &&
      node.content.length === 1
    ) {
      const textNode = node.content[0] as TextNode;
      const text = textNode.text || "";

      // Check for common task list patterns like "- [ ] Task" or "- [x] Completed task"
      if (typeof text === "string") {
        const taskListRegex = /^[-*]\s+\[([\sx])\]\s+(.+)$/;
        const match = text.match(taskListRegex);

        if (match) {
          const isChecked = match[1].toLowerCase() === "x";
          const taskText = match[2];

          // Replace the paragraph with a task item
          nodes[i] = {
            type: "taskItem",
            attrs: { checked: isChecked },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: taskText }],
              },
            ],
          };
        }
      }
    }
  }
};

// Function to clean XML markup from a message
const cleanTextEditMarkup = (message: string) => {
  const editDescriptions: string[] = [];

  // Parse the edits to get more detailed information
  const edits = parseTextEditMarkup(message);

  // Group edits by type for better summarization
  const insertions = edits.filter((edit) => edit.type === "insert");
  const replacements = edits.filter((edit) => edit.type === "replace");
  const deletions = edits.filter((edit) => edit.type === "delete");

  // Create human-readable descriptions
  if (insertions.length > 0) {
    const lines = insertions.map((edit) => `line ${edit.line}`).join(", ");
    editDescriptions.push(`*inserted at ${lines}*`);
  }

  if (replacements.length > 0) {
    const lines = replacements
      .map((edit) => {
        const count =
          edit.count && edit.count > 1
            ? ` to ${edit.line + edit.count - 1}`
            : "";
        return `line${count} ${edit.line}`;
      })
      .join(", ");
    editDescriptions.push(`*replaced content at ${lines}*`);
  }

  if (deletions.length > 0) {
    const lines = deletions
      .map((edit) => {
        const count =
          edit.count && edit.count > 1
            ? ` to ${edit.line + edit.count - 1}`
            : "";
        return `line${count} ${edit.line}`;
      })
      .join(", ");
    editDescriptions.push(`*deleted ${lines}*`);
  }

  // Combine all descriptions
  const cleanedMessage =
    editDescriptions.length > 0 ? editDescriptions.join(", ") : "";

  return cleanedMessage;
};

// Function to get the most current TextEdit content
const getCurrentTextEditContent = (): string | null => {
  try {
    // Get current content as JSON
    const contentJson = localStorage.getItem(APP_STORAGE_KEYS.textedit.CONTENT);
    if (!contentJson) return null;

    // Extract text content
    return extractTextFromTextEditContent(contentJson);
  } catch (error) {
    console.error("Error getting current TextEdit content:", error);
    return null;
  }
};

// Function to ensure TextEdit document is saved before editing
const ensureDocumentSaved = async (content: string): Promise<string | null> => {
  // Check if there's a current file path
  const currentFilePath = localStorage.getItem(
    APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
  );

  if (currentFilePath) {
    return currentFilePath; // Document already has a path
  }

  // Create a new document since there's no current path
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `Untitled-${timestamp}.md`;
  const newPath = `/Documents/${fileName}`;

  console.log("Creating new document for unsaved TextEdit content:", newPath);

  // Prepare the document content in the format TextEdit expects
  const paragraphs = content.split("\n");
  const jsonContent = {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: paragraph.trim() ? [{ type: "text", text: paragraph }] : [],
    })),
  };

  const jsonString = JSON.stringify(jsonContent);

  // Create save file event
  const savePromise = new Promise<boolean>((resolve) => {
    // Create a one-time listener to detect when the file is saved
    const handleSaved = (e: CustomEvent) => {
      if (e.detail?.path === newPath) {
        window.removeEventListener("fileSaved", handleSaved as EventListener);
        resolve(true);
      }
    };

    window.addEventListener("fileSaved", handleSaved as EventListener);

    // Set a timeout to resolve anyway
    setTimeout(() => {
      window.removeEventListener("fileSaved", handleSaved as EventListener);
      resolve(false);
    }, 2000);

    // Dispatch saveFile event
    const saveEvent = new CustomEvent("saveFile", {
      detail: {
        name: fileName,
        path: newPath,
        content: jsonString,
        icon: "/icons/file-text.png",
        isDirectory: false,
        openAfterSave: true,
      },
    });

    window.dispatchEvent(saveEvent);
  });

  // Wait for save to complete
  const saved = await savePromise;

  if (saved) {
    console.log("Successfully created new document:", newPath);
    return newPath;
  } else {
    console.error("Failed to create new document");
    return null;
  }
};

// Add this test function for multiple insertions
const testMultipleInsertions = () => {
  console.log("=== TESTING MULTIPLE INSERTIONS ===");

  // Original content
  const originalContent = "Line 1\nLine 2\nLine 3";
  console.log("Original content:", originalContent);

  // Test message with multiple insert operations
  const testMessage = `<textedit:insert line="1">New first line</textedit:insert>
<textedit:insert line="3">New third line</textedit:insert>
<textedit:insert line="5">New fifth line</textedit:insert>`;

  console.log("Test message:", testMessage);

  // Parse the edits
  const edits = parseTextEditMarkup(testMessage);
  console.log("Parsed edits:", JSON.stringify(edits, null, 2));

  // Apply the edits
  const newContent = applyTextEditChanges(originalContent, edits);
  console.log("New content:", newContent);

  console.log("=== TEST COMPLETE ===");
  return newContent;
};

// Expose test function to window for debugging
// @ts-expect-error - Intentionally exposing function to window for debugging
window.testMultipleInsertions = testMultipleInsertions;

// Test function to validate line number adjustments after edits
const testLineNumberAdjustments = () => {
  console.log("=== TESTING LINE NUMBER ADJUSTMENTS ===");

  // Original content
  const originalContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
  console.log("Original content:", originalContent);

  // Multiple edits that should trigger line number adjustments
  // We'll insert at line 2, then replace line 4 (which should now be line 5 after the insertion)
  const testMessage = `<textedit:insert line="2">New Line A\nNew Line B</textedit:insert>
<textedit:replace line="4" count="1">This Line Was Replaced</textedit:replace>`;

  console.log("Test message:", testMessage);

  // Parse the edits
  const edits = parseTextEditMarkup(testMessage);
  console.log("Parsed edits:", JSON.stringify(edits, null, 2));

  // Expected line numbers after adjustment
  console.log(
    "Expected: second edit should adjust from line 4 to line 6 after insertion"
  );

  // Apply the edits
  const newContent = applyTextEditChanges(originalContent, edits);
  console.log("New content:", newContent);

  // Expected result:
  // Line 1
  // New Line A
  // New Line B
  // Line 2
  // Line 3
  // This Line Was Replaced
  // Line 5

  const expectedContent =
    "Line 1\nNew Line A\nNew Line B\nLine 2\nLine 3\nThis Line Was Replaced\nLine 5";
  console.log(
    "Test result:",
    newContent === expectedContent ? "PASSED" : "FAILED"
  );

  if (newContent !== expectedContent) {
    console.log("Expected:", expectedContent);
    console.log("Actual:", newContent);
  }

  console.log("=== TEST COMPLETE ===");
  return newContent;
};

// Expose test function to window for debugging
// @ts-expect-error - Intentionally exposing function to window for debugging
window.testLineNumberAdjustments = testLineNumberAdjustments;

// Add experimental tests to window for development
// @ts-expect-error - Intentionally exposing functions to window for debugging
window.tests = {
  testReplaceOperations,
  testWithUserContent,
  testMultipleInsertions,
  testLineNumberAdjustments,
};

export function ChatsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
}: AppProps) {
  const initialMessage = {
    id: "1",
    role: "assistant" as const,
    content: "👋 hey! i'm ryo. ask me anything!",
    createdAt: new Date(),
  };

  const { appStates, toggleApp } = useAppContext();
  const launchApp = useLaunchApp();
  const isTextEditOpen = appStates["textedit"]?.isOpen || false;
  const [textEditContext, setTextEditContext] = useState<{
    fileName: string;
    content: string;
  } | null>(null);
  // Add ref to track edit processing to avoid infinite loops
  const isProcessingEdits = useRef(false);
  // Add ref to track processed message IDs
  const processedMessageIds = useRef<Set<string>>(new Set());
  // Add ref to track if initial messages have been loaded
  const initialMessagesLoaded = useRef(false);
  // Add ref to track the timestamp when the component was mounted
  const componentMountedAt = useRef(new Date());
  // Add this new reference at the top of the component, near other useRef declarations
  const lastTextEditContextRef = useRef<string | null>(null);

  // Update the useEffect that watches for TextEdit context changes
  useEffect(() => {
    const updateTextEditContext = () => {
      if (isTextEditOpen) {
        try {
          // Get the current file path
          const lastFilePath = localStorage.getItem(
            APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
          );
          const fileName = lastFilePath
            ? lastFilePath.split("/").pop() || "Untitled"
            : "Untitled";

          // Get the document content
          const content = localStorage.getItem(
            APP_STORAGE_KEYS.textedit.CONTENT
          );

          // Check if content is new/changed to avoid unnecessary processing
          const contentChanged =
            content && content !== lastTextEditContextRef.current;

          if (content && contentChanged) {
            // Save the content reference to avoid redundant processing
            lastTextEditContextRef.current = content;

            // Use lightweight processing on mobile
            if (window.innerWidth <= 768) {
              // For mobile: simpler, immediate processing to avoid UI freezes
              try {
                const extractedText = extractTextFromTextEditContent(content);
                setTextEditContext({
                  fileName,
                  content: extractedText,
                });
              } catch (error) {
                console.error(
                  "Error extracting TextEdit content on mobile:",
                  error
                );
              }
            } else {
              // For desktop: use requestAnimationFrame for smoother UI
              requestAnimationFrame(() => {
                try {
                  const extractedText = extractTextFromTextEditContent(content);
                  setTextEditContext({
                    fileName,
                    content: extractedText,
                  });
                } catch (error) {
                  console.error("Error extracting TextEdit content:", error);
                }
              });
            }
          }
        } catch (error) {
          console.error("Error accessing TextEdit content:", error);
          setTextEditContext(null);
        }
      } else {
        setTextEditContext(null);
      }
    };

    // Initial update
    updateTextEditContext();

    // Listen for storage events to detect TextEdit content changes
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === APP_STORAGE_KEYS.textedit.CONTENT ||
        e.key === APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
      ) {
        updateTextEditContext();
      }
    };

    // Listen for custom saveFile events which TextEdit dispatches when saving
    const handleSaveFile = (e: CustomEvent) => {
      if (e.detail?.path?.startsWith("/Documents/")) {
        updateTextEditContext();
      }
    };

    // Set up event listeners
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("saveFile", handleSaveFile as EventListener);

    // Use a more efficient polling approach - less frequent on mobile
    const pollInterval = window.innerWidth <= 768 ? 3000 : 2000;
    const intervalId = setInterval(updateTextEditContext, pollInterval);

    // Cleanup function
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("saveFile", handleSaveFile as EventListener);
      clearInterval(intervalId);
    };
  }, [isTextEditOpen]);

  // Listen for app state changes
  useEffect(() => {
    const handleAppStateChange = (
      e: CustomEvent<{
        appId: string;
        isOpen: boolean;
        isForeground: boolean;
      }>
    ) => {
      if (e.detail?.appId === "textedit") {
        // If TextEdit app state changed, check if it's now open or closed
        const isNowOpen = e.detail.isOpen;
        if (isNowOpen !== isTextEditOpen) {
          // Force a re-check of the TextEdit context
          setTimeout(() => {
            if (isNowOpen) {
              // TextEdit was just opened, wait a moment for it to initialize
              setTimeout(() => {
                const content = localStorage.getItem(
                  APP_STORAGE_KEYS.textedit.CONTENT
                );
                const lastFilePath = localStorage.getItem(
                  APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
                );

                if (content && lastFilePath) {
                  const fileName = lastFilePath.split("/").pop() || "Untitled";
                  const extractedText = extractTextFromTextEditContent(content);
                  setTextEditContext({
                    fileName,
                    content: extractedText,
                  });
                }
              }, 500);
            } else {
              // TextEdit was closed, clear the context
              setTextEditContext(null);
            }
          }, 0);
        }
      }
    };

    window.addEventListener(
      "appStateChange",
      handleAppStateChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "appStateChange",
        handleAppStateChange as EventListener
      );
    };
  }, [isTextEditOpen]);

  const {
    messages: aiMessages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading,
    reload,
    error,
    stop,
    setMessages: setAiMessages,
    append,
  } = useChat({
    initialMessages: loadChatMessages() || [initialMessage],
    experimental_throttle: 50,
    body: textEditContext
      ? {
          textEditContext,
          systemState: getSystemState(),
        }
      : undefined,
  });

  // Mark initial messages as loaded after the first render
  useEffect(() => {
    if (!initialMessagesLoaded.current && aiMessages.length > 0) {
      console.log("Initial messages loaded, marking as historical");
      initialMessagesLoaded.current = true;

      // Mark all initial messages as processed to prevent applying edits
      aiMessages.forEach((msg) => {
        processedMessageIds.current.add(msg.id);
      });
    }
  }, [aiMessages]);

  // Wrap handleSubmit to include textEditContext and systemState
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      originalHandleSubmit(e, {
        body: textEditContext
          ? {
              textEditContext,
              systemState: getSystemState(),
            }
          : undefined,
      });
    },
    [originalHandleSubmit, textEditContext]
  );

  const [messages, setMessages] = useState(aiMessages);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    setMessages(aiMessages);
    saveChatMessages(aiMessages);

    // Skip TextEdit processing if we're on mobile and the app seems to be in a vulnerable state
    const isMobile = window.innerWidth <= 768;
    const isVulnerable = aiMessages.length <= 1 || isLoading;

    // For mobile devices, use a simplified approach to reduce freezing
    if (isMobile && isVulnerable) {
      return; // Skip processing completely in vulnerable states on mobile
    }

    // Skip heavy TextEdit processing if we only have the initial message (after clearing chats)
    // or if no TextEdit context exists
    if (aiMessages.length > 1) {
      // Only process if we have more than just the initial message
      const lastMessage = aiMessages[aiMessages.length - 1];

      // Skip if this isn't an assistant message
      if (lastMessage.role !== "assistant") {
        return;
      }

      // Skip if already processed and not streaming
      if (processedMessageIds.current.has(lastMessage.id) && !isLoading) {
        return;
      }

      // Skip historical messages (created before the component was mounted)
      if (
        lastMessage.createdAt &&
        lastMessage.createdAt < componentMountedAt.current
      ) {
        console.log("Skipping historical message:", lastMessage.id);
        processedMessageIds.current.add(lastMessage.id);
        return;
      }

      // Check for app control markup
      const containsAppControl = /<app:(launch|close)/i.test(
        lastMessage.content
      );
      const containsTextEditMarkup = /<textedit:(insert|replace|delete)/i.test(
        lastMessage.content
      );

      if (!containsAppControl && !containsTextEditMarkup) {
        // No markup, mark as processed and skip
        if (!isLoading) {
          processedMessageIds.current.add(lastMessage.id);
        }
        return;
      }

      // Handle app control operations
      if (containsAppControl) {
        const operations = parseAppControlMarkup(lastMessage.content);
        if (operations.length > 0) {
          // Execute app control operations
          operations.forEach((op) => {
            if (op.type === "launch") {
              launchApp(op.id as AppId);
            } else if (op.type === "close") {
              toggleApp(op.id);
            }
          });

          // Clean the message content
          const cleanedMessage = cleanAppControlMarkup(lastMessage.content);
          const updatedMessages = [...aiMessages];
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMessage,
            content: cleanedMessage,
          };
          setMessages(updatedMessages);
          setAiMessages(updatedMessages);

          // If no TextEdit markup, mark as processed
          if (!containsTextEditMarkup) {
            processedMessageIds.current.add(lastMessage.id);
          }
        }
      }

      // Handle TextEdit markup
      if (containsTextEditMarkup) {
        // Clean the message content immediately if it contains markup
        const cleanedMessage = cleanTextEditMarkup(lastMessage.content);
        const updatedMessages = [...aiMessages];
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMessage,
          content: cleanedMessage || lastMessage.content,
        };
        setMessages(updatedMessages);

        // If we're streaming, check for complete tags and execute replace operations immediately
        if (isLoading) {
          // Check for complete tags
          const openTags = (
            lastMessage.content.match(/<textedit:(insert|replace|delete)/g) ||
            []
          ).length;
          const closeTags = (
            lastMessage.content.match(
              /<\/textedit:(insert|replace)>|<textedit:delete[^>]*\/>/g
            ) || []
          ).length;

          if (openTags > 0 && openTags === closeTags) {
            console.log(
              "Complete tags detected during streaming, executing only replace operations immediately"
            );

            // Parse all edits
            const allEdits = parseTextEditMarkup(lastMessage.content);

            // Only execute replace operations during streaming
            const replaceEdits = allEdits.filter(
              (edit) => edit.type === "replace"
            );
            const otherEdits = allEdits.filter(
              (edit) => edit.type !== "replace"
            );

            if (replaceEdits.length > 0 && textEditContext) {
              // Only execute replace edits during streaming
              const currentContent =
                getCurrentTextEditContent() || textEditContext.content;
              const newContent = applyTextEditChanges(
                currentContent,
                replaceEdits
              );

              // Try to update the document with replace changes
              const updated = updateTextEditContent(newContent);
              if (updated) {
                // Update local context
                setTextEditContext({
                  ...textEditContext,
                  content: newContent,
                });

                // Keep the message cleaned after the replace operation
                const cleanedMessage = cleanTextEditMarkup(lastMessage.content);
                const updatedMessages = [...aiMessages];
                updatedMessages[updatedMessages.length - 1] = {
                  ...lastMessage,
                  content: cleanedMessage,
                };
                setMessages(updatedMessages);
                setAiMessages(updatedMessages);

                // Mark as processed if there are no other operations pending
                if (otherEdits.length === 0) {
                  processedMessageIds.current.add(lastMessage.id);
                  stop(); // Stop streaming since we're done with all edits
                }
              } else if (replaceEdits.length === 0 && otherEdits.length === 0) {
                // No edits found but tags were complete
                processedMessageIds.current.add(lastMessage.id);
              }
            } else if (replaceEdits.length === 0 && otherEdits.length === 0) {
              // No edits found but tags were complete
              processedMessageIds.current.add(lastMessage.id);
            }
          }
          return;
        }

        // Skip full processing if already processed, no TextEdit context exists, or processing is in progress
        if (
          processedMessageIds.current.has(lastMessage.id) ||
          !textEditContext ||
          isProcessingEdits.current
        ) {
          return;
        }

        // Skip the rest of processing if still streaming
        if (isLoading) {
          return;
        }

        // Only proceed with full edit processing if we have complete markup
        const openTags = (
          lastMessage.content.match(/<textedit:(insert|replace|delete)/g) || []
        ).length;
        const closeTags = (
          lastMessage.content.match(
            /<\/textedit:(insert|replace)>|<textedit:delete[^>]*\/>/g
          ) || []
        ).length;

        if (openTags !== closeTags) {
          console.log(
            `Incomplete XML tags detected: ${openTags} opening vs ${closeTags} closing - waiting for complete message`
          );
          return;
        }

        // If we got here, this message needs processing
        console.log("Processing TextEdit markup in message:", lastMessage.id);
        const edits = parseTextEditMarkup(lastMessage.content);

        if (edits.length === 0) {
          console.log("No valid edits found in message, skipping");
          processedMessageIds.current.add(lastMessage.id);
          return;
        }

        // Set processing flag immediately to prevent race conditions
        isProcessingEdits.current = true;

        // Get the most current content before applying edits
        const currentContent =
          getCurrentTextEditContent() || textEditContext.content;

        // Handle the document saving and editing process
        (async () => {
          let updated = false;
          const updatedMessages = [...aiMessages];
          try {
            // Check if there's a current file path, if not, save the document first
            const currentFilePath = localStorage.getItem(
              APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
            );

            if (!currentFilePath) {
              console.log(
                "No file path found - saving document before editing"
              );

              // Show saving message to user
              const savingMsg = `${cleanTextEditMarkup(
                lastMessage.content
              )}\n\n_[Saving TextEdit document before applying edits...]_`;
              updatedMessages[updatedMessages.length - 1] = {
                ...lastMessage,
                content: savingMsg,
              };
              setMessages(updatedMessages);

              // Try to save the document and get a path
              const savedFilePath = await ensureDocumentSaved(currentContent);

              if (!savedFilePath) {
                console.error("Failed to save document before editing");
                // Show error message to user
                const errorMsg = `${cleanTextEditMarkup(
                  lastMessage.content
                )}\n\n_[Error: Could not save TextEdit document before editing. Please save the document manually first.]_`;
                updatedMessages[updatedMessages.length - 1] = {
                  ...lastMessage,
                  content: errorMsg,
                };
                setAiMessages(updatedMessages);
                setMessages(updatedMessages);
                isProcessingEdits.current = false;
                return;
              }

              // Short delay to let the document saving complete
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            // Get the current file path again (it might have been updated)
            const filePath = localStorage.getItem(
              APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
            );

            if (!filePath) {
              throw new Error("No file path available after saving attempt");
            }

            console.log(
              "Current document line count:",
              currentContent.split("\n").length
            );

            // Apply edits to the TextEdit content
            const newContent = applyTextEditChanges(currentContent, edits);

            console.log(
              "TextEdit content before update:",
              currentContent.substring(0, 100) + "..."
            );
            console.log(
              "TextEdit content after edits:",
              newContent.substring(0, 100) + "..."
            );

            // Update TextEdit content in localStorage
            updated = updateTextEditContent(newContent);

            if (updated) {
              console.log("TextEdit document updated successfully");

              // Update the local context
              setTextEditContext({
                ...textEditContext,
                content: newContent,
              });

              // Clean up the message content to remove XML markup
              const cleanedMessage = cleanTextEditMarkup(lastMessage.content);

              // Update the message in the UI
              updatedMessages[updatedMessages.length - 1] = {
                ...lastMessage,
                content: cleanedMessage,
              };

              // Update the messages without triggering this effect again
              setAiMessages(updatedMessages);
              setMessages(updatedMessages);

              // Add this message ID to the set of processed messages to prevent reprocessing
              processedMessageIds.current.add(lastMessage.id);

              // As a final attempt to ensure the TextEdit app shows the updates,
              // try reopening the file after a brief delay
              setTimeout(() => {
                const currentFilePath = localStorage.getItem(
                  APP_STORAGE_KEYS.textedit.LAST_FILE_PATH
                );
                if (currentFilePath) {
                  // Force reload the current document in TextEdit
                  window.dispatchEvent(
                    new CustomEvent("openFile", {
                      detail: {
                        path: currentFilePath,
                        forceReload: true,
                      },
                    })
                  );
                }
              }, 500);
            }
          } catch (err) {
            console.error("Error handling TextEdit markup:", err);
            // Show error message to user
            const error = err instanceof Error ? err : new Error(String(err));
            const errorMsg = `${cleanTextEditMarkup(
              lastMessage.content
            )}\n\n_[Error: Failed to update TextEdit document: ${
              error.message
            }]_`;
            updatedMessages[updatedMessages.length - 1] = {
              ...lastMessage,
              content: errorMsg,
            };
            setAiMessages(updatedMessages);
            setMessages(updatedMessages);
            isProcessingEdits.current = false;
          }
        })();
      }
    }
  }, [
    aiMessages,
    textEditContext,
    setAiMessages,
    isLoading,
    stop,
    launchApp,
    toggleApp,
  ]);

  const handleDirectMessageSubmit = useCallback(
    (message: string) => {
      append(
        {
          content: message,
          role: "user",
        },
        {
          body: textEditContext
            ? {
                textEditContext,
                systemState: getSystemState(),
              }
            : undefined,
        }
      );
    },
    [append, textEditContext]
  );

  const handleNudge = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 400);
    handleDirectMessageSubmit("👋 *nudge sent*");
  }, [handleDirectMessageSubmit]);

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");

  const clearChats = () => {
    setIsClearDialogOpen(true);
  };

  const confirmClearChats = () => {
    try {
      // Close dialog first and wait for it to complete
      setIsClearDialogOpen(false);

      // Set a flag to block processing for a bit
      isProcessingEdits.current = true;

      // Reset to initial state after a short delay to ensure dialog is closed
      setTimeout(() => {
        // Reset to initial state - only use the hook's methods
        setAiMessages([initialMessage]);
        saveChatMessages([initialMessage]);

        // Reset input state
        handleInputChange({
          target: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>);

        // Release the processing block and log completion
        isProcessingEdits.current = false;
        console.log("Chat cleared successfully");

        // Ensure any lingering pointer-events styles are cleaned up
        document.body.style.removeProperty("pointer-events");
      }, 100);
    } catch (error) {
      console.error("Error clearing chats:", error);
      isProcessingEdits.current = false;
      document.body.style.removeProperty("pointer-events");
    }
  };

  const handleSaveTranscript = () => {
    setIsSaveDialogOpen(true);
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .toLowerCase()
      .replace(":", "-")
      .replace(" ", "");
    setSaveFileName(`chat-${date}-${time}.md`);
  };

  const handleSaveSubmit = (fileName: string) => {
    const transcript = messages
      .map((msg) => {
        const time = msg.createdAt
          ? new Date(msg.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })
          : "";
        return `**${msg.role === "user" ? "You" : "Ryo"}** (${time}):\n${
          msg.content
        }\n`;
      })
      .join("\n");

    const finalFileName = fileName.endsWith(".md")
      ? fileName
      : `${fileName}.md`;
    const filePath = `/Documents/${finalFileName}`;

    const saveEvent = new CustomEvent("saveFile", {
      detail: {
        name: finalFileName,
        path: filePath,
        content: transcript,
        icon: "/icons/file-text.png",
        isDirectory: false,
      },
    });
    window.dispatchEvent(saveEvent);

    setIsSaveDialogOpen(false);
  };

  // Add this right after other useEffect hooks, before the conditional return

  // Cleanup function to ensure we don't have any hanging operations
  useEffect(() => {
    return () => {
      // Reset processing flag on unmount
      isProcessingEdits.current = false;

      // Clear any timers or async operations here if needed

      console.log("Chat component unmounted, cleanup complete");
    };
  }, []);

  if (!isWindowOpen) return null;

  return (
    <>
      <ChatsMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        onClearChats={clearChats}
        onSaveTranscript={handleSaveTranscript}
      />
      <WindowFrame
        title="Chats"
        onClose={onClose}
        isForeground={isForeground}
        appId="chats"
        isShaking={isShaking}
        windowConstraints={{
          maxHeight: window.innerWidth <= 768 ? 360 : undefined,
        }}
      >
        <div className="flex flex-col h-full bg-[#c0c0c0] p-2 w-full">
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            error={error}
            onRetry={reload}
            onClear={clearChats}
          />

          <ChatInput
            input={input}
            isLoading={isLoading}
            isForeground={isForeground}
            onInputChange={handleInputChange}
            onSubmit={handleSubmit}
            onStop={stop}
            onDirectMessageSubmit={handleDirectMessageSubmit}
            onNudge={handleNudge}
          />
          {textEditContext && (
            <div className="font-geneva-12 flex items-center gap-1 text-[10px] text-gray-600 mt-1 px-0 py-0.5">
              <FileText className="w-3 h-3" />
              <span>
                Using{" "}
                <strong>{truncateFilename(textEditContext.fileName)}</strong>
              </span>
            </div>
          )}
        </div>
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={helpItems}
          appName="Chats"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isClearDialogOpen}
          onOpenChange={setIsClearDialogOpen}
          onConfirm={confirmClearChats}
          title="Clear Chats"
          description="Are you sure you want to clear all chats? This action cannot be undone."
        />
        <InputDialog
          isOpen={isSaveDialogOpen}
          onOpenChange={setIsSaveDialogOpen}
          onSubmit={handleSaveSubmit}
          title="Save Transcript"
          description="Enter a name for your transcript file"
          value={saveFileName}
          onChange={setSaveFileName}
        />
      </WindowFrame>
    </>
  );
}
