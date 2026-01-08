import { OrganizationMemberRole } from '@lightdash/common';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';

const TRIAL_ACCOUNT_EMAIL = 'dev-trial@brandct.cn';
const TRIAL_ACCOUNT_FIRST_NAME = '体验';
const TRIAL_ACCOUNT_LAST_NAME = '账号';

// 优先使用环境变量，否则使用默认密码
const TRIAL_ACCOUNT_PASSWORD =
    process.env.TRIAL_ACCOUNT_PASSWORD || 'TrialAccount2026!@#';

export async function up(knex: Knex): Promise<void> {
    // 1. 幂等性检查：检查邮箱是否已存在
    const existingEmail = await knex('emails')
        .where('email', TRIAL_ACCOUNT_EMAIL)
        .first();

    if (existingEmail) {
        // 检查是否已经是体验账号
        const existingUser = await knex('users')
            .where('user_id', existingEmail.user_id)
            .where('is_trial_account', true)
            .first();

        if (existingUser) {
            console.log('体验账号已存在，跳过创建');
            return;
        } else {
            console.log('邮箱已存在但不是体验账号，跳过创建');
            return;
        }
    }

    // 2. 获取第一个组织（按创建时间排序）
    const firstOrg = await knex('organizations')
        .orderBy('created_at', 'asc')
        .first();

    // 3. 创建用户记录
    const [user] = await knex<{
        user_id: number;
        user_uuid: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
        is_setup_complete: boolean;
        is_trial_account: boolean;
        is_marketing_opted_in: boolean;
        is_tracking_anonymized: boolean;
        created_at: Date;
        updated_at: Date;
    }>('users')
        .insert({
            first_name: TRIAL_ACCOUNT_FIRST_NAME,
            last_name: TRIAL_ACCOUNT_LAST_NAME,
            is_active: true,
            is_setup_complete: true,
            is_trial_account: true,
            is_marketing_opted_in: false,
            is_tracking_anonymized: false,
        } as any)
        .returning('*');

    if (!user || !user.user_id) {
        throw new Error('创建体验账号失败：用户记录未创建');
    }

    // 4. 创建邮箱记录
    await knex('emails').insert({
        user_id: user.user_id,
        email: TRIAL_ACCOUNT_EMAIL,
        is_primary: true,
    });

    // 验证邮箱
    await knex('emails')
        .where({
            user_id: user.user_id,
            email: TRIAL_ACCOUNT_EMAIL,
        })
        .update({
            is_verified: true,
        });

    // 5. 创建密码记录（使用 bcrypt 加密）
    const passwordHash = await bcrypt.hash(
        TRIAL_ACCOUNT_PASSWORD,
        await bcrypt.genSalt(),
    );
    await knex('password_logins').insert({
        user_id: user.user_id,
        password_hash: passwordHash,
    });

    // 6. 如果存在组织，添加到第一个组织
    if (firstOrg) {
        await knex('organization_memberships').insert({
            user_id: user.user_id,
            organization_id: firstOrg.organization_id,
            role: OrganizationMemberRole.MEMBER,
        });
        console.log(
            `体验账号已创建并添加到组织: ${firstOrg.organization_uuid}`,
        );
    } else {
        console.log('体验账号已创建（未添加到组织，因为没有组织）');
    }
}

export async function down(knex: Knex): Promise<void> {
    // 删除体验账号（可选）
    const trialEmail = await knex('emails')
        .where('email', TRIAL_ACCOUNT_EMAIL)
        .first();

    if (trialEmail) {
        await knex('password_logins')
            .where('user_id', trialEmail.user_id)
            .delete();
        await knex('organization_memberships')
            .where('user_id', trialEmail.user_id)
            .delete();
        await knex('emails').where('user_id', trialEmail.user_id).delete();
        await knex('users').where('user_id', trialEmail.user_id).delete();
        console.log('体验账号已删除');
    }
}
