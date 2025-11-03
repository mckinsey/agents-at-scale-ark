import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { minimatch } from "minimatch";
import {
  FilesystemContext,
  formatSize,
  getFileStats,
  readFileContent,
  writeFileContent,
  applyFileEdits,
  tailFile,
  headFile,
} from "./lib.js";

const BASE_PATH = process.env.BASE_DATA_DIR || "/mcp-data";

export const createServer = async () => {
  const fsContext = new FilesystemContext(BASE_PATH);
  await fsContext.initialize();

  // Schema definitions
  const SetBaseDirectoryArgsSchema = z.object({
    path: z.string().describe("The new root directory for file operations."),
  });

  const ReadTextFileArgsSchema = z.object({
    path: z.string(),
    tail: z
      .number()
      .optional()
      .describe("If provided, returns only the last N lines of the file"),
    head: z
      .number()
      .optional()
      .describe("If provided, returns only the first N lines of the file"),
  });

  const ReadMediaFileArgsSchema = z.object({
    path: z.string(),
  });

  const ReadMultipleFilesArgsSchema = z.object({
    paths: z
      .array(z.string())
      .min(1, "At least one file path must be provided")
      .describe(
        "Array of file paths to read. Each path must be a string pointing to a valid file within allowed directories."
      ),
  });

  const WriteFileArgsSchema = z.object({
    path: z.string(),
    content: z.string(),
  });

  const EditOperation = z.object({
    oldText: z.string().describe("Text to search for - must match exactly"),
    newText: z.string().describe("Text to replace with"),
  });

  const EditFileArgsSchema = z.object({
    path: z.string(),
    edits: z.array(EditOperation),
    dryRun: z
      .boolean()
      .default(false)
      .describe("Preview changes using git-style diff format"),
  });

  const CreateDirectoryArgsSchema = z.object({
    path: z.string(),
  });

  const ListDirectoryArgsSchema = z.object({
    path: z.string(),
  });

  const ListDirectoryWithSizesArgsSchema = z.object({
    path: z.string(),
    sortBy: z
      .enum(["name", "size"])
      .optional()
      .default("name")
      .describe("Sort entries by name or size"),
  });

  const DirectoryTreeArgsSchema = z.object({
    path: z.string(),
    excludePatterns: z.array(z.string()).optional().default([]),
  });

  const MoveFileArgsSchema = z.object({
    source: z.string(),
    destination: z.string(),
  });

  const SearchFilesArgsSchema = z.object({
    path: z.string(),
    pattern: z.string(),
    excludePatterns: z.array(z.string()).optional().default([]),
  });

  const GetFileInfoArgsSchema = z.object({
    path: z.string().nonempty(),
  });

  const ToolInputSchema = ToolSchema.shape.inputSchema;
  type ToolInput = z.infer<typeof ToolInputSchema>;

  // Server setup
  const server = new Server(
    {
      name: "secure-filesystem-server",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Reads a file as a stream of buffers, concatenates them, and then encodes
  // the result to a Base64 string. This is a memory-efficient way to handle
  // binary data from a stream before the final encoding.
  async function readFileAsBase64Stream(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath);
      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => {
        chunks.push(chunk as Buffer);
      });
      stream.on("end", () => {
        const finalBuffer = Buffer.concat(chunks);
        resolve(finalBuffer.toString("base64"));
      });
      stream.on("error", (err) => reject(err));
    });
  }

  // Tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "set_base_directory",
          description:
            "Add a directory to the allowed directories list. This allows file operations " +
            "to access files within this directory in addition to the session directory.",
          inputSchema: zodToJsonSchema(SetBaseDirectoryArgsSchema) as ToolInput,
        },
        {
          name: "read_file",
          description:
            "Read the complete contents of a file as text. DEPRECATED: Use read_text_file instead.",
          inputSchema: zodToJsonSchema(ReadTextFileArgsSchema) as ToolInput,
        },
        {
          name: "read_text_file",
          description:
            "Read the complete contents of a file from the file system as text. " +
            "Handles various text encodings and provides detailed error messages " +
            "if the file cannot be read. Use this tool when you need to examine " +
            "the contents of a single file. Use the 'head' parameter to read only " +
            "the first N lines of a file, or the 'tail' parameter to read only " +
            "the last N lines of a file. Operates on the file as text regardless of extension. " +
            "Only works within allowed directories.",
          inputSchema: zodToJsonSchema(ReadTextFileArgsSchema) as ToolInput,
        },
        {
          name: "read_media_file",
          description:
            "Read an image or audio file. Returns the base64 encoded data and MIME type. " +
            "Only works within allowed directories.",
          inputSchema: zodToJsonSchema(ReadMediaFileArgsSchema) as ToolInput,
        },
        {
          name: "read_multiple_files",
          description:
            "Read the contents of multiple files simultaneously. This is more " +
            "efficient than reading files one by one when you need to analyze " +
            "or compare multiple files. Each file's content is returned with its " +
            "path as a reference. Failed reads for individual files won't stop " +
            "the entire operation. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(
            ReadMultipleFilesArgsSchema
          ) as ToolInput,
        },
        {
          name: "write_file",
          description:
            "Create a new file or completely overwrite an existing file with new content. " +
            "Use with caution as it will overwrite existing files without warning. " +
            "Handles text content with proper encoding. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
        },
        {
          name: "edit_file",
          description:
            "Make line-based edits to a text file. Each edit replaces exact line sequences " +
            "with new content. Returns a git-style diff showing the changes made. " +
            "Only works within allowed directories.",
          inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
        },
        {
          name: "create_directory",
          description:
            "Create a new directory or ensure a directory exists. Can create multiple " +
            "nested directories in one operation. If the directory already exists, " +
            "this operation will succeed silently. Perfect for setting up directory " +
            "structures for projects or ensuring required paths exist. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
        },
        {
          name: "list_directory",
          description:
            "Get a detailed listing of all files and directories in a specified path. " +
            "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
            "prefixes. This tool is essential for understanding directory structure and " +
            "finding specific files within a directory. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
        },
        {
          name: "list_directory_with_sizes",
          description:
            "Get a detailed listing of all files and directories in a specified path, including sizes. " +
            "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
            "prefixes. This tool is useful for understanding directory structure and " +
            "finding specific files within a directory. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(
            ListDirectoryWithSizesArgsSchema
          ) as ToolInput,
        },
        {
          name: "directory_tree",
          description:
            "Get a recursive tree view of files and directories as a JSON structure. " +
            "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
            "Files have no children array, while directories always have a children array (which may be empty). " +
            "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
        },
        {
          name: "move_file",
          description:
            "Move or rename files and directories. Can move files between directories " +
            "and rename them in a single operation. If the destination exists, the " +
            "operation will fail. Works across different directories and can be used " +
            "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
          inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
        },
        {
          name: "search_files",
          description:
            "Recursively search for files and directories matching a pattern. " +
            "The patterns should be glob-style patterns that match paths relative to the working directory. " +
            "Use pattern like '*.ext' to match files in current directory, and '**/*.ext' to match files in all subdirectories. " +
            "Returns full paths to all matching items. Great for finding files when you don't know their exact location. " +
            "Only searches within allowed directories.",
          inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
        },
        {
          name: "get_file_info",
          description:
            "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
            "information including size, creation time, last modified time, permissions, " +
            "and type. This tool is perfect for understanding file characteristics " +
            "without reading the actual content. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
        },
        {
          name: "list_allowed_directories",
          description:
            "Returns the list of directories that this server is allowed to access. " +
            "Subdirectories within these allowed directories are also accessible. " +
            "Use this to understand which directories and their nested paths are available " +
            "before trying to access files.",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "set_base_directory": {
          const parsed = SetBaseDirectoryArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for set_base_directory: ${parsed.error}`
            );
          }

          // Extract workspace name from path (remove any leading slashes or BASE_PATH references)
          let workspaceName = parsed.data.path;

          // Strip leading slashes
          workspaceName = workspaceName.replace(/^\/+/, '');

          // If path includes base path name, extract just the workspace part
          const basePathName = path.basename(BASE_PATH);
          if (workspaceName.startsWith(basePathName + "/") || workspaceName.startsWith(basePathName + path.sep)) {
            workspaceName = workspaceName.substring(basePathName.length + 1);
          }

          // Create workspace directory under BASE_PATH
          const workspacePath = path.join(BASE_PATH, workspaceName);

          // Set the base directory (creates directory and updates context)
          await fsContext.setBaseDirectory(workspacePath);

          return {
            content: [
              {
                type: "text",
                text: `Successfully set base directory: ${workspacePath}`,
              },
            ],
          };
        }
        case "read_file":
        case "read_text_file": {
          const parsed = ReadTextFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for read_text_file: ${parsed.error}`
            );
          }
          const validPath = await fsContext.validatePath(parsed.data.path);

          if (parsed.data.head && parsed.data.tail) {
            throw new Error(
              "Cannot specify both head and tail parameters simultaneously"
            );
          }

          if (parsed.data.tail) {
            // Use memory-efficient tail implementation for large files
            const tailContent = await tailFile(validPath, parsed.data.tail);
            return {
              content: [{ type: "text", text: tailContent }],
            };
          }

          if (parsed.data.head) {
            // Use memory-efficient head implementation for large files
            const headContent = await headFile(validPath, parsed.data.head);
            return {
              content: [{ type: "text", text: headContent }],
            };
          }
          const content = await readFileContent(validPath);
          return {
            content: [{ type: "text", text: content }],
          };
        }

        case "read_media_file": {
          const parsed = ReadMediaFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for read_media_file: ${parsed.error}`
            );
          }
          const validPath = await fsContext.validatePath(parsed.data.path);
          const extension = path.extname(validPath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
            ".svg": "image/svg+xml",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".ogg": "audio/ogg",
            ".flac": "audio/flac",
          };
          const mimeType = mimeTypes[extension] || "application/octet-stream";
          const data = await readFileAsBase64Stream(validPath);
          const type = mimeType.startsWith("image/")
            ? "image"
            : mimeType.startsWith("audio/")
              ? "audio"
              : "blob";
          return {
            content: [{ type, data, mimeType }],
          };
        }

        case "read_multiple_files": {
          const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for read_multiple_files: ${parsed.error}`
            );
          }
          const results = await Promise.all(
            parsed.data.paths.map(async (filePath: string) => {
              try {
                const validPath = await fsContext.validatePath(filePath);
                const content = await readFileContent(validPath);
                return `${filePath}:\n${content}\n`;
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                return `${filePath}: Error - ${errorMessage}`;
              }
            })
          );
          return {
            content: [{ type: "text", text: results.join("\n---\n") }],
          };
        }

        case "write_file": {
          const parsed = WriteFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for write_file: ${parsed.error}`
            );
          }
          const validPath = await fsContext.validatePath(parsed.data.path);
          await writeFileContent(validPath, parsed.data.content);
          return {
            content: [
              {
                type: "text",
                text: `Successfully wrote to ${parsed.data.path}`,
              },
            ],
          };
        }

        case "edit_file": {
          const parsed = EditFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
          }
          const validPath = await fsContext.validatePath(parsed.data.path);
          const result = await applyFileEdits(
            validPath,
            parsed.data.edits,
            parsed.data.dryRun
          );
          return {
            content: [{ type: "text", text: result }],
          };
        }

        case "create_directory": {
          const parsed = CreateDirectoryArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for create_directory: ${parsed.error}`
            );
          }
          const validPath = await fsContext.validatePath(parsed.data.path);
          await fs.mkdir(validPath, { recursive: true });
          return {
            content: [
              {
                type: "text",
                text: `Successfully created directory ${parsed.data.path}`,
              },
            ],
          };
        }

        case "list_directory": {
          const parsed = ListDirectoryArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for list_directory: ${parsed.error}`
            );
          }
          const validPath = await fsContext.validatePath(parsed.data.path);
          const entries = await fs.readdir(validPath, { withFileTypes: true });
          const formatted = entries
            .map(
              (entry) =>
                `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`
            )
            .join("\n");
          return {
            content: [{ type: "text", text: formatted }],
          };
        }

        case "list_directory_with_sizes": {
          const parsed = ListDirectoryWithSizesArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for list_directory_with_sizes: ${parsed.error}`
            );
          }
          const validPath = await fsContext.validatePath(parsed.data.path);
          const entries = await fs.readdir(validPath, { withFileTypes: true });

          // Get detailed information for each entry
          const detailedEntries = await Promise.all(
            entries.map(async (entry) => {
              const entryPath = path.join(validPath, entry.name);
              try {
                const stats = await fs.stat(entryPath);
                return {
                  name: entry.name,
                  isDirectory: entry.isDirectory(),
                  size: stats.size,
                  mtime: stats.mtime,
                };
              } catch (error) {
                return {
                  name: entry.name,
                  isDirectory: entry.isDirectory(),
                  size: 0,
                  mtime: new Date(0),
                };
              }
            })
          );

          // Sort entries based on sortBy parameter
          const sortedEntries = [...detailedEntries].sort((a, b) => {
            if (parsed.data.sortBy === "size") {
              return b.size - a.size; // Descending by size
            }
            // Default sort by name
            return a.name.localeCompare(b.name);
          });

          // Format the output
          const formattedEntries = sortedEntries.map(
            (entry) =>
              `${entry.isDirectory ? "[DIR]" : "[FILE]"} ${entry.name.padEnd(30)} ${
                entry.isDirectory ? "" : formatSize(entry.size).padStart(10)
              }`
          );

          // Add summary
          const totalFiles = detailedEntries.filter(
            (e) => !e.isDirectory
          ).length;
          const totalDirs = detailedEntries.filter((e) => e.isDirectory).length;
          const totalSize = detailedEntries.reduce(
            (sum, entry) => sum + (entry.isDirectory ? 0 : entry.size),
            0
          );

          const summary = [
            "",
            `Total: ${totalFiles} files, ${totalDirs} directories`,
            `Combined size: ${formatSize(totalSize)}`,
          ];

          return {
            content: [
              {
                type: "text",
                text: [...formattedEntries, ...summary].join("\n"),
              },
            ],
          };
        }

        case "directory_tree": {
          const parsed = DirectoryTreeArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for directory_tree: ${parsed.error}`
            );
          }

          interface TreeEntry {
            name: string;
            type: "file" | "directory";
            children?: TreeEntry[];
          }
          const rootPath = parsed.data.path;

          async function buildTree(
            currentPath: string,
            excludePatterns: string[] = []
          ): Promise<TreeEntry[]> {
            const validPath = await fsContext.validatePath(currentPath);
            const entries = await fs.readdir(validPath, {
              withFileTypes: true,
            });
            const result: TreeEntry[] = [];

            for (const entry of entries) {
              const relativePath = path.relative(
                rootPath,
                path.join(currentPath, entry.name)
              );
              const shouldExclude = excludePatterns.some((pattern) => {
                if (pattern.includes("*")) {
                  return minimatch(relativePath, pattern, { dot: true });
                }
                // For files: match exact name or as part of path
                // For directories: match as directory path
                return (
                  minimatch(relativePath, pattern, { dot: true }) ||
                  minimatch(relativePath, `**/${pattern}`, { dot: true }) ||
                  minimatch(relativePath, `**/${pattern}/**`, { dot: true })
                );
              });
              if (shouldExclude) continue;

              const entryData: TreeEntry = {
                name: entry.name,
                type: entry.isDirectory() ? "directory" : "file",
              };

              if (entry.isDirectory()) {
                const subPath = path.join(currentPath, entry.name);
                entryData.children = await buildTree(subPath, excludePatterns);
              }

              result.push(entryData);
            }

            return result;
          }

          const treeData = await buildTree(
            rootPath,
            parsed.data.excludePatterns
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(treeData, null, 2),
              },
            ],
          };
        }

        case "move_file": {
          const parsed = MoveFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
          }
          const validSourcePath = await fsContext.validatePath(parsed.data.source);
          const validDestPath = await fsContext.validatePath(parsed.data.destination);
          await fs.rename(validSourcePath, validDestPath);
          return {
            content: [
              {
                type: "text",
                text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}`,
              },
            ],
          };
        }

        case "search_files": {
          const parsed = SearchFilesArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for search_files: ${parsed.error}`
            );
          }
          const validPath = await fsContext.validatePath(parsed.data.path);
          const results = await fsContext.searchFilesWithValidation(
            validPath,
            parsed.data.pattern,
            { excludePatterns: parsed.data.excludePatterns }
          );
          return {
            content: [
              {
                type: "text",
                text:
                  results.length > 0 ? results.join("\n") : "No matches found",
              },
            ],
          };
        }

        case "get_file_info": {
          const parsed = GetFileInfoArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(
              `Invalid arguments for get_file_info: ${parsed.error}`
            );
          }
          const validPath = await fsContext.validatePath(parsed.data.path);
          const info = await getFileStats(validPath);
          return {
            content: [
              {
                type: "text",
                text: Object.entries(info)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join("\n"),
              },
            ],
          };
        }

        case "list_allowed_directories": {
          return {
            content: [
              {
                type: "text",
                text: `Allowed directories:\n${fsContext.getAllowedDirectories().join("\n")}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Handles post-initialization setup, specifically checking for and fetching MCP roots.
  server.oninitialized = async () => {
    const allowedDirs = fsContext.getAllowedDirectories();
    if (allowedDirs.length > 0) {
      console.error("Using allowed directories", allowedDirs);
    } else {
      throw new Error(
        `Server cannot operate: No allowed directories available. Server was started without command-line directories and client either does not support MCP roots protocol or provided empty roots. Please either: 1) Start server with directory arguments, or 2) Use a client that supports MCP roots protocol and provides valid root directories.`
      );
    }
  };

  return server;
};
