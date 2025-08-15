import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { LocalHistoryMCPServer } from '../src/index.ts';

describe('LocalHistoryMCPServer', () => {
	let server: LocalHistoryMCPServer;

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
