import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import logger from './logger.ts';

export interface HistoryEntry {
	timestamp: number;
	content: string;
	filePath: string;
	relativePath: string;
}

export interface FileHistory {
	originalFilePath: string;
	entries: HistoryEntry[];
}

/**
 * Convert a file URI to a file system path
 */
export function uriToPath(uri: string): string {
	if (uri.startsWith('file://')) {
		// Remove file:// prefix and decode URI components
		let path = uri.slice(7);
		// Decode URI-encoded characters
		path = decodeURIComponent(path);
		return path;
	}
	return uri; // Return as-is if not a URI
}

/**
 * Convert a file system path to a file URI
 */
export function pathToUri(filePath: string): string {
	if (!filePath.startsWith('file://')) {
		return `file://${encodeURI(filePath)}`;
	}
	return filePath; // Return as-is if already a URI
}

export class VSCodeHistoryParser {
	private historyDir: string;

	constructor() {
		this.historyDir = this.getHistoryDirectory();
	}

	/**
	 * Get the VS Code/Cursor Local History directory based on the current OS
	 * Tries Cursor first, then falls back to VS Code
	 */
	private getHistoryDirectory(): string {
		const homeDir = os.homedir();

		let cursorPath: string;
		let vsCodePath: string;

		switch (process.platform) {
			case 'win32':
				cursorPath = path.join(
					process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
					'Cursor',
					'User',
					'History',
				);
				vsCodePath = path.join(
					process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
					'Code',
					'User',
					'History',
				);
				break;
			case 'darwin':
				cursorPath = path.join(
					homeDir,
					'Library',
					'Application Support',
					'Cursor',
					'User',
					'History',
				);
				vsCodePath = path.join(
					homeDir,
					'Library',
					'Application Support',
					'Code',
					'User',
					'History',
				);
				break;
			case 'linux':
				cursorPath = path.join(homeDir, '.config', 'Cursor', 'User', 'History');
				vsCodePath = path.join(homeDir, '.config', 'Code', 'User', 'History');
				break;
			default:
				throw new Error(`Unsupported operating system: ${process.platform}`);
		}

		// Prefer Cursor if it exists, otherwise fall back to VS Code
		if (fs.existsSync(cursorPath)) {
			return cursorPath;
		}
		if (fs.existsSync(vsCodePath)) {
			return vsCodePath;
		}
		return cursorPath; // Return Cursor path as default for new installations
	}

	/**
	 * Check if the VS Code history directory exists
	 */
	public historyDirectoryExists(): boolean {
		return fs.existsSync(this.historyDir);
	}

	/**
	 * Get all file history directories
	 */
	public getHistoryDirectories(): string[] {
		if (!this.historyDirectoryExists()) {
			return [];
		}

		try {
			return fs
				.readdirSync(this.historyDir, { withFileTypes: true })
				.filter((dirent) => dirent.isDirectory())
				.map((dirent) => dirent.name);
		} catch (error) {
			logger.warn({ error }, 'Failed to read history directory');
			return [];
		}
	}

	/**
	 * Parse the entries.json file to get metadata about a file's history
	 */
	private parseEntriesJson(
		historyDirPath: string,
	): { resource?: string } | null {
		const entriesJsonPath = path.join(historyDirPath, 'entries.json');

		if (!fs.existsSync(entriesJsonPath)) {
			return null;
		}

		try {
			const content = fs.readFileSync(entriesJsonPath, 'utf-8');
			return JSON.parse(content);
		} catch (error) {
			logger.warn({ error, entriesJsonPath }, 'Failed to parse entries.json');
			return null;
		}
	}

	/**
	 * Get history for a specific file by its hash directory
	 */
	public getFileHistory(hashDir: string): FileHistory | null {
		const historyDirPath = path.join(this.historyDir, hashDir);

		if (!fs.existsSync(historyDirPath)) {
			return null;
		}

		const entriesJson = this.parseEntriesJson(historyDirPath);

		if (!entriesJson || !entriesJson.resource) {
			return null;
		}

		const originalFilePath = entriesJson.resource;
		const entries: HistoryEntry[] = [];

		try {
			// Read all files in the history directory (excluding entries.json)
			const historyFiles = fs
				.readdirSync(historyDirPath)
				.filter((file) => file !== 'entries.json')
				.sort(); // Sort to get chronological order

			for (const file of historyFiles) {
				const filePath = path.join(historyDirPath, file);
				const stats = fs.statSync(filePath);

				try {
					const content = fs.readFileSync(filePath, 'utf-8');

					entries.push({
						timestamp: stats.mtime.getTime(),
						content,
						filePath: filePath,
						relativePath: file,
					});
				} catch (error) {
					logger.warn({ error, file }, 'Failed to read history file');
				}
			}

			return {
				originalFilePath,
				entries: entries.sort((a, b) => b.timestamp - a.timestamp), // Most recent first
			};
		} catch (error) {
			logger.warn({ error, hashDir }, 'Failed to read history directory');
			return null;
		}
	}

	/**
	 * Get all file histories
	 */
	public getAllFileHistories(): FileHistory[] {
		const histories: FileHistory[] = [];
		const hashDirs = this.getHistoryDirectories();

		for (const hashDir of hashDirs) {
			const history = this.getFileHistory(hashDir);
			if (history) {
				histories.push(history);
			}
		}

		return histories;
	}

	/**
	 * Find history for a specific file path
	 */
	public findHistoryByFilePath(targetFilePath: string): FileHistory | null {
		const histories = this.getAllFileHistories();

		// Convert URI to path if needed
		const cleanTargetPath = uriToPath(targetFilePath);
		const normalizedTarget = path.resolve(cleanTargetPath);

		for (const history of histories) {
			const cleanHistoryPath = uriToPath(history.originalFilePath);
			const normalizedHistory = path.resolve(cleanHistoryPath);

			// Exact match
			if (normalizedTarget === normalizedHistory) {
				return history;
			}

			// Case-insensitive match (for case-insensitive filesystems)
			if (normalizedTarget.toLowerCase() === normalizedHistory.toLowerCase()) {
				return history;
			}
		}

		return null;
	}

	/**
	 * Get basic statistics about the history
	 */
	public getHistoryStats(): {
		totalFiles: number;
		totalEntries: number;
		historyDirExists: boolean;
		historyDirPath: string;
	} {
		const histories = this.getAllFileHistories();
		const totalEntries = histories.reduce(
			(sum, history) => sum + history.entries.length,
			0,
		);

		return {
			totalFiles: histories.length,
			totalEntries,
			historyDirExists: this.historyDirectoryExists(),
			historyDirPath: this.historyDir,
		};
	}
}
