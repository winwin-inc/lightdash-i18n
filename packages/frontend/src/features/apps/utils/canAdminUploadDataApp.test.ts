import { Ability, AbilityBuilder } from '@casl/ability';
import { type MemberAbility } from '@lightdash/common';
import { canAdminUploadDataApp } from './canAdminUploadDataApp';

const projectUuid = 'project-uuid-1234';
const organizationUuid = 'org-uuid-1234';

const abilityFor = (
    define: (can: AbilityBuilder<MemberAbility>['can']) => void,
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    define(builder.can);
    return builder.build();
};

describe('canAdminUploadDataApp', () => {
    it('returns false when the user is missing', () => {
        expect(canAdminUploadDataApp(undefined, projectUuid)).toBe(false);
    });

    it('returns true for org-scoped manage:DataApp', () => {
        const ability = abilityFor((can) => {
            can('manage', 'DataApp', { organizationUuid });
        });
        expect(
            canAdminUploadDataApp({ ability, organizationUuid }, projectUuid),
        ).toBe(true);
    });

    it('returns true for project-scoped manage:DataApp', () => {
        const ability = abilityFor((can) => {
            can('manage', 'DataApp', { projectUuid });
        });
        expect(
            canAdminUploadDataApp({ ability, organizationUuid }, projectUuid),
        ).toBe(true);
    });

    it('returns false for create:DataApp without admin manage', () => {
        const ability = abilityFor((can) => {
            can('create', 'DataApp', { projectUuid });
        });
        expect(
            canAdminUploadDataApp({ ability, organizationUuid }, projectUuid),
        ).toBe(false);
    });

    it('returns false for manage:DataApp that is only granted to the creator', () => {
        const ability = abilityFor((can) => {
            can('manage', 'DataApp', {
                projectUuid,
                createdByUserUuid: 'someone-else',
            });
        });
        expect(
            canAdminUploadDataApp({ ability, organizationUuid }, projectUuid),
        ).toBe(false);
    });
});
