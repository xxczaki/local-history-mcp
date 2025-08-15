import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import {
	pathToUri,
	uriToPath,
	VSCodeHistoryParser,
} from '../src/history-parser.ts';

describe('VSCodeHistoryParser', () => {
	let parser: VSCodeHistoryParser;
	let tempDir: string;

	beforeEach(() => {
		parser = new VSCodeHistoryParser();
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-history-test-'));
	});

	after(() => {
		if (tempDir && fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('URI conversion utilities', () => {
		it('should convert file URI to path', () => {
			const uri: string = 'file:///Users/test/file.txt';
			const result: string = uriToPath(uri);

			assert.strictEqual(result, '/Users/test/file.txt');
		});

		it('should handle non-URI paths', () => {
			const filePath: string = '/Users/test/file.txt';
			const result: string = uriToPath(filePath);

			assert.strictEqual(result, filePath);
		});

		it('should convert path to URI', () => {
			const filePath = '/Users/test/file.txt';
			const result = pathToUri(filePath);

			assert.strictEqual(result, 'file:///Users/test/file.txt');
		});

		it('should handle URI-encoded characters', () => {
			const uri = 'file:///Users/test/file%20with%20spaces.txt';
			const result = uriToPath(uri);

			assert.strictEqual(result, '/Users/test/file with spaces.txt');
		});
	});

	describe('History directory detection', () => {
		it('should detect if history directory exists', () => {
			const exists = parser.historyDirectoryExists();

			assert.strictEqual(typeof exists, 'boolean');
		});

		it('should get history statistics', () => {
			const stats = parser.getHistoryStats();

			assert.strictEqual(typeof stats.totalFiles, 'number');
			assert.strictEqual(typeof stats.totalEntries, 'number');
			assert.strictEqual(typeof stats.historyDirExists, 'boolean');
			assert.strictEqual(typeof stats.historyDirPath, 'string');
		});
	});

	describe('File history operations', () => {
		it('should handle non-existent history gracefully', () => {
			const history = parser.findHistoryByFilePath('/non/existent/file.txt');

			assert.strictEqual(history, null);
		});

		it('should get all file histories', () => {
			const histories = parser.getAllFileHistories();

			assert.strictEqual(Array.isArray(histories), true);

			if (histories.length > 0) {
				const firstHistory = histories[0];

				assert.strictEqual(typeof firstHistory.originalFilePath, 'string');
				assert.strictEqual(Array.isArray(firstHistory.entries), true);
			}
		});
	});
});
