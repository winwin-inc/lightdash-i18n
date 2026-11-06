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
            'content_fields',
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
        assert.match(getMcpDocsText('query_workflow'), /includeExplores/);
        assert.match(getMcpDocsText('query_workflow'), /拒绝查询/);
        assert.match(getMcpDocsText('query_workflow'), /resolvedDashboardContext/);
        assert.match(getMcpDocsText('query_workflow'), /dashboardUuid/);
        assert.match(getMcpDocsText('overview'), /get_my_access/);
        assert.match(getMcpDocsText('content_fields'), /chartKind/);
        assert.match(getMcpDocsText('content_fields'), /groups/);
        assert.match(getMcpDocsText('content_fields'), /custom/);
    });

    it('documents the strict dashboard mode', () => {
        const workflow = getMcpDocsText('query_workflow');
        assert.match(workflow, /dashboardStrict/);
        assert.match(workflow, /dashboardContact/);
        // 状态枚举齐全
        assert.match(workflow, /dashboard_permission_required/);
        assert.match(workflow, /dashboard_configuration_required/);
        assert.match(workflow, /dashboard_selection_required/);
        assert.match(workflow, /dashboard_not_found/);
        assert.match(workflow, /dashboard_context_unavailable/);
        // 看板发现路径
        assert.match(workflow, /list_dashboards/);
        assert.match(workflow, /find_dashboards/);
        assert.match(workflow, /get_dashboard_tiles/);
        // 修正与实际行为不符的表述
        assert.doesNotMatch(workflow, /不要干等/);
        assert.match(getMcpDocsText('overview'), /dashboardStrict/);
        assert.match(getMcpDocsText('overview'), /dashboardContact/);
    });

    it('defaults overview', () => {
        assert.equal(getMcpDocsText(), getMcpDocsText('overview'));
    });
});
