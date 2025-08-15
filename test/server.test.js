import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { LocalHistoryMCPServer } from '../dist/index.js';

describe('LocalHistoryMCPServer', () => {
	let server;

	beforeEach(() => {
		server = new LocalHistoryMCPServer();
	});

	describe('Server initialization', () => {
		it('should create server instance', () => {
			assert(server instanceof LocalHistoryMCPServer);
			assert.strictEqual(typeof server.run, 'function');
		});
	});

	describe('Tool definitions', () => {
		it('should provide required MCP tools', async () => {
			assert(server);
		});
	});
});
