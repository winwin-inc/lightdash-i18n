type ScriptTarget = 'chart' | 'dashboard' | 'all';

type ScriptOptions = {
    dryRun: boolean;
    projectUuid?: string;
    target: ScriptTarget;
    emailReportTo?: string[];
};

const usage = `
Usage:
  pnpm -F backend fix-duplicate-slugs [options]

Options:
  --execute                    Execute updates (default is dry run)
  --dry-run                    Explicit dry run mode
  --target <chart|dashboard|all>  Target entities to fix (default: all)
  --projectUuid <uuid>         Restrict fix to one project
  --emailReportTo <emails>     Comma-separated emails for chart fix report
  --help                       Show this help

Examples:
  pnpm -F backend fix-duplicate-slugs --dry-run --projectUuid <project-uuid>
  pnpm -F backend fix-duplicate-slugs --execute --target chart
  pnpm -F backend fix-duplicate-slugs --execute --target all --projectUuid <project-uuid>
`;

const getOptionValue = (args: string[], optionName: string) => {
    const optionPrefix = `${optionName}=`;
    const prefixedArg = args.find((arg) => arg.startsWith(optionPrefix));
    if (prefixedArg) {
        return prefixedArg.slice(optionPrefix.length);
    }

    const optionIndex = args.indexOf(optionName);
    if (optionIndex === -1) return undefined;
    return args[optionIndex + 1];
};

const parseTarget = (targetArg: string | undefined): ScriptTarget => {
    if (!targetArg) return 'all';
    if (
        targetArg === 'chart' ||
        targetArg === 'dashboard' ||
        targetArg === 'all'
    )
        return targetArg;
    throw new Error(
        `Invalid target "${targetArg}". Use one of: chart, dashboard, all.`,
    );
};

const parseOptions = (args: string[]): ScriptOptions => {
    if (args.includes('--help') || args.includes('-h')) {
        console.info(usage);
        process.exit(0);
    }

    const execute = args.includes('--execute');
    const dryRunExplicit = args.includes('--dry-run');
    if (execute && dryRunExplicit) {
        throw new Error('Cannot use both --execute and --dry-run.');
    }

    const projectUuid = getOptionValue(args, '--projectUuid');
    const target = parseTarget(getOptionValue(args, '--target'));
    const emailReportToRaw = getOptionValue(args, '--emailReportTo');
    const emailReportTo = emailReportToRaw
        ?.split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

    return {
        dryRun: !execute,
        projectUuid,
        target,
        emailReportTo,
    };
};

async function run() {
    const options = parseOptions(process.argv.slice(2));
    console.info('Starting duplicate slug fix script with options:', options);

    const [
        { default: App },
        { lightdashConfig },
        { default: knexConfig },
        ee,
        fixScripts,
    ] = await Promise.all([
        import('../App'),
        import('../config/lightdashConfig'),
        import('../knexfile'),
        import('../ee'),
        import('../ee/repl/scripts/fixDuplicateSlugs'),
    ]);

    const app = new App({
        lightdashConfig,
        port: process.env.PORT || 8080,
        environment:
            process.env.NODE_ENV === 'development'
                ? 'development'
                : 'production',
        knexConfig,
        ...(await ee.getEnterpriseAppArguments()),
    });

    const database = app.getDatabase();
    const clients = app.getClients();
    const scripts = fixScripts.getFixDuplicateSlugsScripts(database, clients);

    try {
        if (options.target === 'chart' || options.target === 'all') {
            await scripts.fixDuplicateChartSlugs({
                dryRun: options.dryRun,
                projectUuid: options.projectUuid,
                emailReportTo: options.emailReportTo,
            });
        }

        if (options.target === 'dashboard' || options.target === 'all') {
            await scripts.fixDuplicateDashboardSlugs({
                dryRun: options.dryRun,
                projectUuid: options.projectUuid,
            });
        }
    } finally {
        await database.destroy();
    }
}

run().catch((error) => {
    console.error('Failed to fix duplicate slugs:', error);
    process.exit(1);
});
