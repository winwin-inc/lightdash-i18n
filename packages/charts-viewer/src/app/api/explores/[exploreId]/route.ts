import { NextRequest, NextResponse } from 'next/server';
import { buildExploreDisplay } from '@/lib/exploreDisplay';
import { fetchExplore } from '@/lib/lightdash';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ exploreId: string }> },
) {
    const { exploreId } = await params;
    const projectUuid = request.nextUrl.searchParams.get('projectUuid');
    if (!projectUuid) {
        return NextResponse.json(
            { error: 'projectUuid is required' },
            { status: 400 },
        );
    }
    try {
        const raw = await fetchExplore(projectUuid, exploreId);
        const display = buildExploreDisplay(raw as Parameters<typeof buildExploreDisplay>[0]);
        return NextResponse.json(display);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
