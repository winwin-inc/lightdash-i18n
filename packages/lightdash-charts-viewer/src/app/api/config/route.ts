import { NextResponse } from 'next/server';

export async function GET() {
    const projectUuid = process.env.LIGHTDASH_PROJECT_UUID;
    if (!projectUuid) {
        return NextResponse.json(
            { error: 'LIGHTDASH_PROJECT_UUID is not set' },
            { status: 500 },
        );
    }
    return NextResponse.json({ projectUuid });
}
