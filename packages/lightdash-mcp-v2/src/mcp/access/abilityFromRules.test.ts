import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    accessLevelFromCapabilities,
    canFromRules,
    capabilitiesFromRules,
    mergeCapabilities,
    parseAbilityRules,
    type AbilityRuleLike,
} from './abilityFromRules';

const ORG_UUID = 'org-1';
const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';

function rule(
    action: string,
    subject: string,
    conditions?: Record<string, unknown>,
    inverted?: boolean,
): AbilityRuleLike {
    return { action, subject, conditions, inverted };
}

describe('canFromRules', () => {
    it('treats org-scoped manage Explore as view Explore', () => {
        const rules = [
            rule('manage', 'Explore', { organizationUuid: ORG_UUID }),
        ];
        assert.equal(
            canFromRules(rules, 'view', 'Explore', { type: 'org' }),
            true,
        );
        assert.equal(
            capabilitiesFromRules(rules, { type: 'org' }).runMetricQuery,
            true,
        );
    });

    it('does not apply another project rule to the current project', () => {
        const rules = [
            rule('view', 'Explore', { projectUuid: PROJECT_B }),
            rule('view', 'Project', { projectUuid: PROJECT_B }),
        ];
        const caps = capabilitiesFromRules(rules, {
            type: 'project',
            projectUuid: PROJECT_A,
        });
        assert.equal(caps.runMetricQuery, false);
        assert.equal(caps.browseContent, false);
        assert.equal(
            accessLevelFromCapabilities(caps),
            null,
        );
    });

    it('reads project-scoped interactive viewer rules', () => {
        const rules = [
            rule('view', 'Project', { projectUuid: PROJECT_A }),
            rule('view', 'SavedChart', { projectUuid: PROJECT_A }),
            rule('manage', 'Explore', { projectUuid: PROJECT_A }),
        ];
        const projectCaps = capabilitiesFromRules(rules, {
            type: 'project',
            projectUuid: PROJECT_A,
        });
        assert.equal(projectCaps.browseContent, true);
        assert.equal(projectCaps.runSavedChart, true);
        assert.equal(projectCaps.runMetricQuery, true);
        assert.equal(projectCaps.exportDashboardCode, false);
        assert.equal(
            accessLevelFromCapabilities(projectCaps),
            'interactive_viewer',
        );
    });

    it('keeps org member capabilities empty and unions project role', () => {
        const rules = [
            rule('view', 'OrganizationMemberProfile', {
                organizationUuid: ORG_UUID,
            }),
            rule('view', 'Project', { projectUuid: PROJECT_A }),
            rule('view', 'SavedChart', { projectUuid: PROJECT_A }),
            rule('manage', 'Explore', { projectUuid: PROJECT_A }),
        ];
        const orgCaps = capabilitiesFromRules(rules, { type: 'org' });
        assert.deepEqual(orgCaps, {
            browseContent: false,
            runSavedChart: false,
            runMetricQuery: false,
            exportDashboardCode: false,
        });
        const projectCaps = capabilitiesFromRules(rules, {
            type: 'project',
            projectUuid: PROJECT_A,
        });
        const effective = mergeCapabilities(orgCaps, projectCaps);
        assert.equal(effective.runMetricQuery, true);
        assert.equal(
            accessLevelFromCapabilities(effective),
            'interactive_viewer',
        );
        assert.equal(accessLevelFromCapabilities(projectCaps), 'interactive_viewer');
    });

    it('lets org-level Explore lift every project effective capability', () => {
        const rules = [
            rule('view', 'Project', { organizationUuid: ORG_UUID }),
            rule('view', 'SavedChart', { organizationUuid: ORG_UUID }),
            rule('manage', 'Explore', { organizationUuid: ORG_UUID }),
        ];
        const orgCaps = capabilitiesFromRules(rules, { type: 'org' });
        const projectCaps = capabilitiesFromRules(rules, {
            type: 'project',
            projectUuid: PROJECT_A,
        });
        assert.equal(orgCaps.runMetricQuery, true);
        assert.equal(projectCaps.runMetricQuery, false);
        assert.equal(accessLevelFromCapabilities(projectCaps), null);
        const effective = mergeCapabilities(orgCaps, projectCaps);
        assert.equal(effective.runMetricQuery, true);
        assert.equal(
            accessLevelFromCapabilities(effective),
            'interactive_viewer',
        );
    });

    it('maps ContentAsCode to editor', () => {
        const rules = [
            rule('view', 'Project', { projectUuid: PROJECT_A }),
            rule('view', 'SavedChart', { projectUuid: PROJECT_A }),
            rule('view', 'Explore', { projectUuid: PROJECT_A }),
            rule('view', 'ContentAsCode', { projectUuid: PROJECT_A }),
        ];
        const caps = capabilitiesFromRules(rules, {
            type: 'project',
            projectUuid: PROJECT_A,
        });
        assert.equal(caps.exportDashboardCode, true);
        assert.equal(accessLevelFromCapabilities(caps), 'editor');
    });

    it('honors inverted cannot rules', () => {
        const rules = [
            rule('view', 'Explore', { projectUuid: PROJECT_A }),
            rule('view', 'Explore', { projectUuid: PROJECT_A }, true),
        ];
        assert.equal(
            canFromRules(rules, 'view', 'Explore', {
                type: 'project',
                projectUuid: PROJECT_A,
            }),
            false,
        );
    });
});

describe('parseAbilityRules', () => {
    it('returns empty array for missing rules', () => {
        assert.deepEqual(parseAbilityRules(undefined), []);
        assert.deepEqual(parseAbilityRules({}), []);
    });
});
