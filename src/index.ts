import fs from 'node:fs';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { uriToPath, VSCodeHistoryParser } from './history-parser.ts';
import logger from './logger.ts';

class LocalHistoryMCPServer {
	private server: Server;
	private historyParser: VSCodeHistoryParser;

	constructor() {
		this.server = new Server(
			{
				name: 'local-history-mcp',
				version: '1.0.0',
			},
			{
				capabilities: {
					tools: {},
				},
			},
		);

		this.historyParser = new VSCodeHistoryParser();
		this.setupToolHandlers();
		this.setupErrorHandling();
	}

	private setupErrorHandling() {
		this.server.onerror = (error) => {
			logger.error({ error }, 'MCP server error');
		};

		process.on('SIGINT', async () => {
			logger.info('Received SIGINT, shutting down gracefully');
			await this.server.close();
			process.exit(0);
		});
	}

	private setupToolHandlers() {
		this.server.setRequestHandler(ListToolsRequestSchema, async () => {
			return {
				tools: [
					{
						name: 'list_history_files',
						description:
							'List all files that have local history entries in VS Code',
						inputSchema: {
							type: 'object',
							properties: {},
							additionalProperties: false,
						},
					},
					{
						name: 'get_file_history',
						description: 'Get the complete history for a specific file',
						inputSchema: {
							type: 'object',
							properties: {
								filePath: {
									type: 'string',
									description:
										'The path to the file. Please provide an absolute path (e.g., "/Users/user/project/biome.json") for reliable matching.',
								},
							},
							required: ['filePath'],
							additionalProperties: false,
						},
					},
					{
						name: 'get_history_entry',
						description: 'Get a specific history entry for a file',
						inputSchema: {
							type: 'object',
							properties: {
								filePath: {
									type: 'string',
									description:
										'The path to the file. Please provide an absolute path (e.g., "/Users/user/project/biome.json") for reliable matching.',
								},
								entryIndex: {
									type: 'number',
									description:
										'The index of the history entry (0 = most recent)',
								},
							},
							required: ['filePath', 'entryIndex'],
							additionalProperties: false,
						},
					},
					{
						name: 'restore_from_history',
						description:
							'Restore a file to a specific point in its local history',
						inputSchema: {
							type: 'object',
							properties: {
								filePath: {
									type: 'string',
									description:
										'The absolute path to the file to restore (e.g., "/Users/user/project/biome.json").',
								},
								entryIndex: {
									type: 'number',
									description:
										'The index of the history entry to restore (0 = most recent)',
								},
								createBackup: {
									type: 'boolean',
									description:
										'Whether to create a backup of the current file before restoring',
									default: true,
								},
							},
							required: ['filePath', 'entryIndex'],
							additionalProperties: false,
						},
					},
					{
						name: 'get_history_stats',
						description:
							'Get statistics about the local history (total files, entries, etc.)',
						inputSchema: {
							type: 'object',
							properties: {},
							additionalProperties: false,
						},
					},
					{
						name: 'search_history_content',
						description:
							'Search for specific content across all history entries',
						inputSchema: {
							type: 'object',
							properties: {
								searchTerm: {
									type: 'string',
									description: 'The text to search for in history entries',
								},
								caseSensitive: {
									type: 'boolean',
									description: 'Whether the search should be case sensitive',
									default: false,
								},
							},
							required: ['searchTerm'],
							additionalProperties: false,
						},
					},
				],
			};
		});

		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			try {
				const { name, arguments: args } = request.params;

				switch (name) {
					case 'list_history_files':
						return await this.listHistoryFiles();

					case 'get_file_history': {
						if (!args || typeof args !== 'object' || !('filePath' in args)) {
							throw new McpError(
								ErrorCode.InvalidParams,
								'Missing required parameter: filePath',
							);
						}
						const filePathHistory = args.filePath as string;
						if (!path.isAbsolute(filePathHistory)) {
							throw new McpError(
								ErrorCode.InvalidParams,
								'filePath must be an absolute path',
							);
						}
						return await this.getFileHistory(filePathHistory);
					}

					case 'get_history_entry': {
						if (
							!args ||
							typeof args !== 'object' ||
							!('filePath' in args) ||
							!('entryIndex' in args)
						) {
							throw new McpError(
								ErrorCode.InvalidParams,
								'Missing required parameters: filePath, entryIndex',
							);
						}
						const filePathEntry = args.filePath as string;
						if (!path.isAbsolute(filePathEntry)) {
							throw new McpError(
								ErrorCode.InvalidParams,
								'filePath must be an absolute path',
							);
						}
						return await this.getHistoryEntry(
							filePathEntry,
							args.entryIndex as number,
						);
					}

					case 'restore_from_history': {
						if (
							!args ||
							typeof args !== 'object' ||
							!('filePath' in args) ||
							!('entryIndex' in args)
						) {
							throw new McpError(
								ErrorCode.InvalidParams,
								'Missing required parameters: filePath, entryIndex',
							);
						}
						const filePathRestore = args.filePath as string;
						if (!path.isAbsolute(filePathRestore)) {
							throw new McpError(
								ErrorCode.InvalidParams,
								'filePath must be an absolute path',
							);
						}
						return await this.restoreFromHistory(
							filePathRestore,
							args.entryIndex as number,
							((args as Record<string, unknown>).createBackup as boolean) ??
								true,
						);
					}

					case 'get_history_stats':
						return await this.getHistoryStats();

					case 'search_history_content':
						if (!args || typeof args !== 'object' || !('searchTerm' in args)) {
							throw new McpError(
								ErrorCode.InvalidParams,
								'Missing required parameter: searchTerm',
							);
						}
						return await this.searchHistoryContent(
							args.searchTerm as string,
							((args as Record<string, unknown>).caseSensitive as boolean) ??
								false,
						);

					default:
						throw new McpError(
							ErrorCode.MethodNotFound,
							`Unknown tool: ${name}`,
						);
				}
			} catch (error) {
				if (error instanceof McpError) {
					throw error;
				}

				throw new McpError(
					ErrorCode.InternalError,
					`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		});
	}

	private async listHistoryFiles() {
		const histories = this.historyParser.getAllFileHistories();

		const fileList = histories.map((history) => ({
			filePath: history.originalFilePath,
			entryCount: history.entries.length,
			lastModified: new Date(history.entries[0]?.timestamp || 0).toISOString(),
		}));

		return {
			content: [
				{
					type: 'text',
					text:
						`Found ${fileList.length} files with local history:\n\n` +
						fileList
							.map(
								(file) =>
									`📄 ${file.filePath}\n` +
									`   └── ${file.entryCount} history entries\n` +
									`   └── Last saved: ${file.lastModified}`,
							)
							.join('\n\n'),
				},
			],
		};
	}

	private async getFileHistory(filePath: string) {
		const history = this.historyParser.findHistoryByFilePath(filePath);

		if (!history) {
			return {
				content: [
					{
						type: 'text',
						text: `No local history found for: ${filePath}`,
					},
				],
			};
		}

		const entriesText = history.entries
			.map(
				(entry, index) =>
					`[${index}] ${new Date(entry.timestamp).toLocaleString()}\n` +
					`     File: ${entry.relativePath}\n` +
					`     Size: ${entry.content.length} characters`,
			)
			.join('\n\n');

		return {
			content: [
				{
					type: 'text',
					text:
						`History for: ${history.originalFilePath}\n` +
						`Total entries: ${history.entries.length}\n\n` +
						`History entries (most recent first):\n\n${entriesText}`,
				},
			],
		};
	}

	private async getHistoryEntry(filePath: string, entryIndex: number) {
		const history = this.historyParser.findHistoryByFilePath(filePath);

		if (!history) {
			return {
				content: [
					{
						type: 'text',
						text: `No local history found for: ${filePath}`,
					},
				],
			};
		}

		if (entryIndex < 0 || entryIndex >= history.entries.length) {
			return {
				content: [
					{
						type: 'text',
						text: `Invalid entry index ${entryIndex}. Available indices: 0-${history.entries.length - 1}`,
					},
				],
			};
		}

		const entry = history.entries[entryIndex];

		return {
			content: [
				{
					type: 'text',
					text:
						`History Entry ${entryIndex} for: ${history.originalFilePath}\n` +
						`Timestamp: ${new Date(entry.timestamp).toLocaleString()}\n` +
						`Size: ${entry.content.length} characters\n\n` +
						`Content:\n\`\`\`\n${entry.content}\n\`\`\``,
				},
			],
		};
	}

	private async restoreFromHistory(
		filePath: string,
		entryIndex: number,
		createBackup: boolean,
	) {
		const history = this.historyParser.findHistoryByFilePath(filePath);

		if (!history) {
			return {
				content: [
					{
						type: 'text',
						text: `No local history found for: ${filePath}`,
					},
				],
			};
		}

		if (entryIndex < 0 || entryIndex >= history.entries.length) {
			return {
				content: [
					{
						type: 'text',
						text: `Invalid entry index ${entryIndex}. Available indices: 0-${history.entries.length - 1}`,
					},
				],
			};
		}

		const entry = history.entries[entryIndex];

		// Convert URIs to file system paths
		const originalPath = uriToPath(history.originalFilePath);
		const inputPath = uriToPath(filePath);

		// Determine target path - prefer input path if it exists, otherwise use original
		const targetPath = fs.existsSync(inputPath) ? inputPath : originalPath;

		try {
			// Ensure the directory exists
			const dir = path.dirname(targetPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Create backup if requested and file exists
			if (createBackup && fs.existsSync(targetPath)) {
				const backupPath = `${targetPath}.backup.${Date.now()}`;
				fs.copyFileSync(targetPath, backupPath);

				// Restore the file
				fs.writeFileSync(targetPath, entry.content, 'utf-8');

				return {
					content: [
						{
							type: 'text',
							text:
								`✅ Successfully restored ${targetPath} to history entry ${entryIndex}\n` +
								`📄 Backup created at: ${backupPath}\n` +
								`🕐 Restored to state from: ${new Date(entry.timestamp).toLocaleString()}`,
						},
					],
				};
			}
			// Restore without backup
			fs.writeFileSync(targetPath, entry.content, 'utf-8');

			return {
				content: [
					{
						type: 'text',
						text:
							`✅ Successfully restored ${targetPath} to history entry ${entryIndex}\n` +
							`🕐 Restored to state from: ${new Date(entry.timestamp).toLocaleString()}\n` +
							'⚠️  No backup was created',
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: 'text',
						text: `❌ Failed to restore file: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
			};
		}
	}

	private async getHistoryStats() {
		const stats = this.historyParser.getHistoryStats();

		return {
			content: [
				{
					type: 'text',
					text:
						'📊 Local History Statistics\n\n' +
						`History directory: ${stats.historyDirPath}\n` +
						`Directory exists: ${stats.historyDirExists ? '✅' : '❌'}\n` +
						`Total files with history: ${stats.totalFiles}\n` +
						`Total history entries: ${stats.totalEntries}\n` +
						`Average entries per file: ${stats.totalFiles > 0 ? (stats.totalEntries / stats.totalFiles).toFixed(1) : 'N/A'}`,
				},
			],
		};
	}

	private async searchHistoryContent(
		searchTerm: string,
		caseSensitive: boolean,
	) {
		const histories = this.historyParser.getAllFileHistories();
		const results: Array<{
			file: string;
			entryIndex: number;
			timestamp: string;
			matchCount: number;
		}> = [];

		const searchRegex = new RegExp(
			searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
			caseSensitive ? 'g' : 'gi',
		);

		for (const history of histories) {
			history.entries.forEach((entry, index) => {
				const matches = entry.content.match(searchRegex);
				if (matches) {
					results.push({
						file: history.originalFilePath,
						entryIndex: index,
						timestamp: new Date(entry.timestamp).toLocaleString(),
						matchCount: matches.length,
					});
				}
			});
		}

		if (results.length === 0) {
			return {
				content: [
					{
						type: 'text',
						text: `No matches found for "${searchTerm}" in local history.`,
					},
				],
			};
		}

		const resultsText = results
			.map(
				(result) =>
					`📄 ${result.file}\n` +
					`   └── Entry ${result.entryIndex} (${result.timestamp})\n` +
					`   └── ${result.matchCount} match${result.matchCount === 1 ? '' : 'es'}`,
			)
			.join('\n\n');

		return {
			content: [
				{
					type: 'text',
					text: `🔍 Found ${results.length} entries containing "${searchTerm}":\n\n${resultsText}`,
				},
			],
		};
	}

	public async run() {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		logger.info('Local History MCP Server started on stdio transport');
	}
}

// Start the server
const isMainModule = typeof require !== 'undefined' && require.main === module;

if (isMainModule) {
	const server = new LocalHistoryMCPServer();

	server.run().catch((error) => {
		logger.error({ error }, 'Failed to start server');
		process.exit(1);
	});
}

export { LocalHistoryMCPServer };
export { pathToUri, uriToPath, VSCodeHistoryParser } from './history-parser.ts';
