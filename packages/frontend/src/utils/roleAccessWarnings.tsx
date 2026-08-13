import {
    isSystemRole,
    OrganizationMemberRole,
    type GroupWithMembers,
    type ProjectMemberRole,
    type RoleAssignment,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { type TFunction } from 'i18next';
import { type ReactNode } from 'react';
import { Trans } from 'react-i18next';

export const systemRolesOrder: string[] = Object.values(OrganizationMemberRole);

export interface UserGroupAccess {
    group: GroupWithMembers;
    access: RoleAssignment;
    roleName: string;
}

export interface AccessWarningParams {
    organizationRole?: string;
    hasProjectRole: boolean;
    projectRole?: ProjectMemberRole | null;
    userGroupAccess?: UserGroupAccess | null;
    t: TFunction;
}

const translateSystemRole = (role: string, t: TFunction) =>
    t(`components_project_access.roles.${role}`, { defaultValue: role });

/* 
  The accessWarning shows alerts when role conflicts or inheritance may cause permission issues:

  1. No Warning: If user has no organization role OR no project role → return
  2. System Role Conflicts (when project role is system role like admin/editor/viewer):
    - Group > Project: If user's group role ranks higher than project role → Show "inherits from
   group" warning
    - Org > Project: If user's organization role ranks higher than project role → Show "inherits
   higher from org" warning
  3. Custom Group Role: If user belongs to group with custom role → Show "group has custom role"
   warning
  4. Custom Project Role: If user has custom project role → Show "custom + org role conflict"
  warning
*/
export const getAccessWarning = ({
    organizationRole,
    hasProjectRole,
    projectRole,
    userGroupAccess,
    t,
}: AccessWarningParams): ReactNode | undefined => {
    try {
        // Check for organization role warnings (existing logic)
        if (!organizationRole) return;

        const typedProjectRole = projectRole as ProjectMemberRole;

        if (isSystemRole(typedProjectRole)) {
            // Group role inheritance warning
            if (
                userGroupAccess?.access.roleId &&
                systemRolesOrder.indexOf(userGroupAccess.access.roleId) >
                    systemRolesOrder.indexOf(typedProjectRole)
            ) {
                return (
                    <Text fw={300}>
                        <Trans
                            i18nKey="components_project_access_row_v2.access_warning.inherit_from_group"
                            values={{
                                roleName: userGroupAccess.roleName,
                                groupName: userGroupAccess.group.name,
                            }}
                            components={{
                                bold: <Text fw={600} span />,
                            }}
                        />
                    </Text>
                );
            }

            // Organization role inheritance warning
            if (
                systemRolesOrder.indexOf(organizationRole) >
                systemRolesOrder.indexOf(typedProjectRole)
            ) {
                return (
                    <Text fw={300}>
                        <Trans
                            i18nKey="components_project_access_row_v2.access_warning.inherit_higher_from_org"
                            values={{
                                role: translateSystemRole(
                                    organizationRole,
                                    t,
                                ),
                            }}
                            components={{
                                bold: <Text fw={600} span />,
                            }}
                        />
                    </Text>
                );
            }
        }

        // Custom group role warning
        if (
            userGroupAccess?.access.roleId &&
            !isSystemRole(userGroupAccess.access.roleId)
        ) {
            return (
                <>
                    <Text fw={300}>
                        <Trans
                            i18nKey="components_project_access_row_v2.access_warning.custom_group_belongs"
                            values={{
                                groupName: userGroupAccess.group.name,
                            }}
                            components={{
                                bold: <Text fw={600} span />,
                            }}
                        />
                    </Text>
                    <Text fw={300}>
                        <Trans
                            i18nKey="components_project_access_row_v2.access_warning.custom_group_has_role"
                            values={{
                                roleName: userGroupAccess.roleName,
                            }}
                            components={{
                                bold: <Text fw={600} span />,
                            }}
                        />
                    </Text>
                    <Text fw={300}>
                        {t(
                            'components_project_access_row_v2.access_warning.custom_group_override',
                        )}
                    </Text>
                </>
            );
        }

        if (hasProjectRole && !isSystemRole(typedProjectRole)) {
            // Custom project role warning
            return (
                <>
                    <Text fw={300}>
                        <Trans
                            i18nKey="components_project_access_row_v2.access_warning.custom_project_has_org"
                            values={{
                                role: translateSystemRole(
                                    organizationRole,
                                    t,
                                ),
                            }}
                            components={{
                                bold: <Text fw={600} span />,
                            }}
                        />
                    </Text>
                    <Text fw={300}>
                        {t(
                            'components_project_access_row_v2.access_warning.custom_project_override',
                        )}
                    </Text>
                </>
            );
        }
    } catch (error) {
        console.error('Error getting access warning', error);
        return null;
    }
};
