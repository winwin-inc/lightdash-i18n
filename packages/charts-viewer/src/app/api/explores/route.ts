import { NextRequest, NextResponse } from 'next/server';
import { fetchExplores } from '@/lib/lightdash';

export async function GET(request: NextRequest) {
    const projectUuid = request.nextUrl.searchParams.get('projectUuid');
    if (!projectUuid) {
        return NextResponse.json(
            { error: 'projectUuid is required' },
            { status: 400 },
        );
    }
    try {
        const filtered = request.nextUrl.searchParams.get('filtered');
        const filteredBool = filtered !== 'false';
        const results = await fetchExplores(projectUuid, filteredBool);
        return NextResponse.json(results);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
