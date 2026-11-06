import { ProjectMemberRole } from '../types/projectMemberRole';
import { SpaceMemberRole } from '../types/space';
import {
    getHighestSpaceRole,
    isClientUseRestrictedProjectRole,
} from './projectMemberRole';

describe('projectMemberRole', () => {
    describe('isClientUseRestrictedProjectRole', () => {
        it('returns true for viewer and interactive_viewer', () => {
            expect(
                isClientUseRestrictedProjectRole(ProjectMemberRole.VIEWER),
            ).toBe(true);
            expect(
                isClientUseRestrictedProjectRole(
                    ProjectMemberRole.INTERACTIVE_VIEWER,
                ),
            ).toBe(true);
        });

        it('returns false for editor, developer, admin and undefined', () => {
            expect(
                isClientUseRestrictedProjectRole(ProjectMemberRole.EDITOR),
            ).toBe(false);
            expect(
                isClientUseRestrictedProjectRole(ProjectMemberRole.DEVELOPER),
            ).toBe(false);
            expect(
                isClientUseRestrictedProjectRole(ProjectMemberRole.ADMIN),
            ).toBe(false);
            expect(isClientUseRestrictedProjectRole(undefined)).toBe(false);
        });
    });
    describe('getHighestSpaceRole', () => {
        it('should get the highest space role', () => {
            const highestRole = getHighestSpaceRole([
                SpaceMemberRole.ADMIN,
                SpaceMemberRole.EDITOR,
                SpaceMemberRole.VIEWER,
            ]);
            expect(highestRole).toBe(SpaceMemberRole.ADMIN);

            const highestRole2 = getHighestSpaceRole([
                SpaceMemberRole.EDITOR,
                SpaceMemberRole.VIEWER,
            ]);
            expect(highestRole2).toBe(SpaceMemberRole.EDITOR);

            const highestRole3 = getHighestSpaceRole([SpaceMemberRole.VIEWER]);
            expect(highestRole3).toBe(SpaceMemberRole.VIEWER);

            const highestRole4 = getHighestSpaceRole([
                SpaceMemberRole.VIEWER,
                undefined,
            ]);
            expect(highestRole4).toBe(SpaceMemberRole.VIEWER);

            const highestRole5 = getHighestSpaceRole([undefined, undefined]);
            expect(highestRole5).toBe(undefined);

            const highestRole6 = getHighestSpaceRole([
                undefined,
                SpaceMemberRole.VIEWER,
                SpaceMemberRole.EDITOR,
            ]);
            expect(highestRole6).toBe(SpaceMemberRole.EDITOR);
            // Test goes here
        });
    });
});
