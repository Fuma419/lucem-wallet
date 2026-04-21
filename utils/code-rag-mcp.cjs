#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

const DEFAULT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".html",
  ".txt",
  ".sh",
]);

const DEFAULT_EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "build",
  "coverage",
  "test-results",
  "lancedb",
  "models",
  ".cursor/rag",
  "src/wasm",
]);

const DEFAULT_INCLUDE_PATHS = [
  "src",
  ".github/workflows",
  "utils",
  "package.json",
  "README.md",
];

const MAX_FILE_BYTES = 1024 * 1024; // 1MB
const CHUNK_LINES = 60;
const CHUNK_OVERLAP = 15;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

const BASE_DIR = path.resolve(process.env.CODE_RAG_BASE_DIR || process.cwd());
const INDEX_PATH = path.resolve(
  process.env.CODE_RAG_INDEX_PATH || path.join(BASE_DIR, ".cursor/rag/code-index.json")
);

function ensureInsideBase(candidatePath) {
  const resolved = path.resolve(BASE_DIR, candidatePath);
  const relative = path.relative(BASE_DIR, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes CODE_RAG_BASE_DIR: ${candidatePath}`);
  }
  return resolved;
}

function isExcludedDir(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (!normalized) return false;
  if (DEFAULT_EXCLUDED_DIRS.has(normalized)) return true;

  const parts = normalized.split("/");
  for (let i = 0; i < parts.length; i += 1) {
    const segmentPath = parts.slice(0, i + 1).join("/");
    if (DEFAULT_EXCLUDED_DIRS.has(segmentPath) || DEFAULT_EXCLUDED_DIRS.has(parts[i])) {
      return true;
    }
  }
  return false;
}

function shouldIndexFile(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  return DEFAULT_EXTENSIONS.has(ext);
}

function tokenize(text) {
  const matches = text.toLowerCase().match(/[a-z0-9_.$/-]{2,}/g);
  return matches || [];
}

function countTokens(tokens) {
  const counts = Object.create(null);
  for (const token of tokens) {
    counts[token] = (counts[token] || 0) + 1;
  }
  return counts;
}

function toRelativePath(absolutePath) {
  return path.relative(BASE_DIR, absolutePath).split(path.sep).join("/");
}

function listFilesFromStart(startPath, outFiles) {
  const stat = fs.statSync(startPath);
  const relative = toRelativePath(startPath);

  if (stat.isDirectory()) {
    if (isExcludedDir(relative)) return;

    const entries = fs.readdirSync(startPath, { withFileTypes: true });
    for (const entry of entries) {
      listFilesFromStart(path.join(startPath, entry.name), outFiles);
    }
    return;
  }

  if (!stat.isFile()) return;
  if (stat.size > MAX_FILE_BYTES) return;
  if (!shouldIndexFile(relative)) return;
  outFiles.push(startPath);
}

function collectFiles(pathsToScan) {
  const files = [];
  for (const rawPath of pathsToScan) {
    let absolutePath;
    try {
      absolutePath = ensureInsideBase(rawPath);
    } catch (error) {
      continue;
    }

    if (!fs.existsSync(absolutePath)) continue;
    listFilesFromStart(absolutePath, files);
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function chunkByLines(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  const chunks = [];

  if (lines.length === 0) return chunks;

  let start = 0;
  while (start < lines.length) {
    const endExclusive = Math.min(lines.length, start + CHUNK_LINES);
    const text = lines.slice(start, endExclusive).join("\n").trim();
    if (text.length > 0) {
      chunks.push({
        startLine: start + 1,
        endLine: endExclusive,
        text,
      });
    }

    if (endExclusive >= lines.length) break;
    start = Math.max(start + 1, endExclusive - CHUNK_OVERLAP);
  }

  return chunks;
}

function buildIndex(pathsToScan = DEFAULT_INCLUDE_PATHS) {
  const files = collectFiles(pathsToScan);
  const chunks = [];
  const df = Object.create(null);

  let totalTokenCount = 0;
  let chunkId = 0;

  for (const absolutePath of files) {
    let fileContent;
    try {
      fileContent = fs.readFileSync(absolutePath, "utf8");
    } catch (error) {
      continue;
    }

    if (!fileContent || fileContent.includes("\u0000")) continue;

    const fileChunks = chunkByLines(fileContent);
    const relativePath = toRelativePath(absolutePath);

    for (const fileChunk of fileChunks) {
      const tokens = tokenize(fileChunk.text);
      if (tokens.length === 0) continue;

      const tokenCounts = countTokens(tokens);
      const uniqueTokens = Object.keys(tokenCounts);
      for (const token of uniqueTokens) {
        df[token] = (df[token] || 0) + 1;
      }

      totalTokenCount += tokens.length;
      chunks.push({
        id: chunkId,
        filePath: relativePath,
        startLine: fileChunk.startLine,
        endLine: fileChunk.endLine,
        text: fileChunk.text,
        tokenCount: tokens.length,
        tokenCounts,
      });
      chunkId += 1;
    }
  }

  const chunkCount = chunks.length;
  const fileSet = new Set(chunks.map((chunk) => chunk.filePath));
  const avgChunkTokens = chunkCount > 0 ? totalTokenCount / chunkCount : 1;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseDir: BASE_DIR,
    includePaths: pathsToScan,
    fileCount: fileSet.size,
    chunkCount,
    avgChunkTokens,
    df,
    chunks,
  };
}

function saveIndex(index) {
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index), "utf8");
}

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) return null;

  const raw = fs.readFileSync(INDEX_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.chunks) || typeof parsed.chunkCount !== "number") {
    return null;
  }

  return parsed;
}

function idf(index, term) {
  const total = index.chunkCount || 0;
  const df = index.df[term] || 0;
  return Math.log(((total - df + 0.5) / (df + 0.5)) + 1);
}

function scoreChunk(index, chunk, queryTerms) {
  let score = 0;
  const avgChunkTokens = index.avgChunkTokens || 1;
  const chunkLen = Math.max(chunk.tokenCount || 1, 1);

  for (const term of queryTerms) {
    const tf = chunk.tokenCounts[term] || 0;
    if (tf <= 0) continue;

    const numerator = tf * (BM25_K1 + 1);
    const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (chunkLen / avgChunkTokens));
    score += idf(index, term) * (numerator / denominator);
  }

  return score;
}

function extensionBoost(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") return 1.15;
  if (ext === ".md" || ext === ".txt") return 0.8;
  return 1;
}

function searchIndex(index, query, limit = 8, pathPrefix = "") {
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0) return [];

  const normalizedPrefix = pathPrefix.trim().replace(/\\/g, "/");
  const scopedChunks = normalizedPrefix
    ? index.chunks.filter((chunk) => chunk.filePath.startsWith(normalizedPrefix))
    : index.chunks;

  const scored = [];
  for (const chunk of scopedChunks) {
    const score = scoreChunk(index, chunk, queryTerms);
    if (score <= 0) continue;

    let boostedScore = score * extensionBoost(chunk.filePath);
    if (chunk.filePath.toLowerCase().includes(query.toLowerCase())) {
      boostedScore *= 1.1;
    }
    scored.push({
      score: boostedScore,
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      text: chunk.text,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(limit, 20)));
}

function getContextSlice(filePath, lineNumber, before, after) {
  const absolutePath = ensureInsideBase(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
  const target = Math.max(1, lineNumber);
  const start = Math.max(1, target - before);
  const end = Math.min(lines.length, target + after);
  const excerpt = [];

  for (let line = start; line <= end; line += 1) {
    excerpt.push(`${line}|${lines[line - 1]}`);
  }

  return {
    filePath: toRelativePath(absolutePath),
    startLine: start,
    endLine: end,
    excerpt: excerpt.join("\n"),
  };
}

function asTextResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function runServer() {
  const server = new McpServer({
    name: "code-rag-local",
    version: "0.1.0",
  });

  server.registerTool(
    "code_rag_rebuild_index",
    {
      description: "Rebuild local code RAG index from repository files.",
      inputSchema: {
        paths: z.array(z.string()).optional().describe("Relative paths to index. Defaults to core repository folders."),
      },
    },
    async ({ paths }) => {
      const selectedPaths = Array.isArray(paths) && paths.length > 0 ? paths : DEFAULT_INCLUDE_PATHS;
      const index = buildIndex(selectedPaths);
      saveIndex(index);
      return asTextResult({
        indexPath: INDEX_PATH,
        baseDir: BASE_DIR,
        generatedAt: index.generatedAt,
        fileCount: index.fileCount,
        chunkCount: index.chunkCount,
        includePaths: index.includePaths,
      });
    }
  );

  server.registerTool(
    "code_rag_status",
    {
      description: "Show status for the local code RAG index.",
      inputSchema: {},
    },
    async () => {
      const index = loadIndex();
      if (!index) {
        return asTextResult({
          indexPath: INDEX_PATH,
          exists: false,
          message: "No index found. Run code_rag_rebuild_index first.",
        });
      }

      return asTextResult({
        indexPath: INDEX_PATH,
        exists: true,
        generatedAt: index.generatedAt,
        fileCount: index.fileCount,
        chunkCount: index.chunkCount,
        includePaths: index.includePaths,
      });
    }
  );

  server.registerTool(
    "code_rag_search",
    {
      description: "Search indexed code chunks by keyword-aware BM25 scoring.",
      inputSchema: {
        query: z.string().min(2).describe("Search query."),
        limit: z.number().int().min(1).max(20).default(8).describe("Maximum result count."),
        pathPrefix: z
          .string()
          .optional()
          .describe("Optional relative path prefix to narrow search, for example src/api."),
      },
    },
    async ({ query, limit, pathPrefix }) => {
      const index = loadIndex();
      if (!index) {
        return asTextResult({
          error: "Index not found",
          message: "Run code_rag_rebuild_index before searching.",
        });
      }

      const results = searchIndex(index, query, limit, pathPrefix || "");
      return asTextResult({
        query,
        resultCount: results.length,
        results,
      });
    }
  );

  server.registerTool(
    "code_rag_read_context",
    {
      description: "Read nearby lines around a target line in a file.",
      inputSchema: {
        filePath: z.string().describe("Relative file path from repository root."),
        line: z.number().int().min(1).describe("Target line number."),
        before: z.number().int().min(0).max(200).default(25).describe("Lines before target."),
        after: z.number().int().min(0).max(200).default(25).describe("Lines after target."),
      },
    },
    async ({ filePath, line, before, after }) => {
      try {
        const context = getContextSlice(filePath, line, before, after);
        return asTextResult(context);
      } catch (error) {
        return {
          content: [{ type: "text", text: String(error.message || error) }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function runCli() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) return false;

  if (command === "index") {
    const pathsToScan = rest.length > 0 ? rest : DEFAULT_INCLUDE_PATHS;
    const index = buildIndex(pathsToScan);
    saveIndex(index);
    process.stdout.write(
      `${JSON.stringify(
        {
          indexPath: INDEX_PATH,
          generatedAt: index.generatedAt,
          fileCount: index.fileCount,
          chunkCount: index.chunkCount,
          includePaths: index.includePaths,
        },
        null,
        2
      )}\n`
    );
    return true;
  }

  if (command === "status") {
    const index = loadIndex();
    process.stdout.write(
      `${JSON.stringify(
        index
          ? {
              exists: true,
              indexPath: INDEX_PATH,
              generatedAt: index.generatedAt,
              fileCount: index.fileCount,
              chunkCount: index.chunkCount,
              includePaths: index.includePaths,
            }
          : {
              exists: false,
              indexPath: INDEX_PATH,
              message: "No index found",
            },
        null,
        2
      )}\n`
    );
    return true;
  }

  if (command === "query") {
    const queryText = rest.join(" ").trim();
    if (!queryText) {
      process.stderr.write("Usage: node utils/code-rag-mcp.cjs query <text>\n");
      process.exitCode = 1;
      return true;
    }

    const index = loadIndex();
    if (!index) {
      process.stderr.write("No index found. Run: node utils/code-rag-mcp.cjs index\n");
      process.exitCode = 1;
      return true;
    }

    const results = searchIndex(index, queryText, 8, "");
    process.stdout.write(`${JSON.stringify({ query: queryText, results }, null, 2)}\n`);
    return true;
  }

  return false;
}

if (!runCli()) {
  runServer().catch((error) => {
    console.error("code-rag-mcp server error:", error);
    process.exit(1);
  });
}
