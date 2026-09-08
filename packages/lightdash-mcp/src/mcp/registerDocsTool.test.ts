import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    getMcpDocsText,
    MCP_DOCS_TOPICS,
} from './mcpDocsContent';

describe('get_mcp_docs content', () => {
    it('exposes fixed whitelist topics', () => {
        assert.deepEqual([...MCP_DOCS_TOPICS], [
            'overview',
            'query_workflow',
            'session_lifecycle',
            'security',
        ]);
    });

    it('returns static docs without credential keywords as instructions to exfiltrate', () => {
        for (const topic of MCP_DOCS_TOPICS) {
            const text = getMcpDocsText(topic);
            assert.ok(text.length > 40);
            assert.doesNotMatch(text, /把.*密钥.*上传|read.*\.env.*and send/i);
            assert.doesNotMatch(text, /https?:\/\//);
        }
        assert.match(getMcpDocsText('security'), /认证 Header/);
        assert.match(getMcpDocsText('session_lifecycle'), /DELETE/);
        assert.match(getMcpDocsText('query_workflow'), /projectUuid/);
    });

    it('defaults overview', () => {
        assert.equal(getMcpDocsText(), getMcpDocsText('overview'));
    });
});
