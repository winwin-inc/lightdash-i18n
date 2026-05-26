import { NextResponse } from 'next/server';
import { feature } from 'topojson-client';

const CHINA_TOPOJSON_URL =
    'https://img1.17gaoda.com/assets-fe/lightdash/0.0.1/treemap/tdt_xg_china_topojson.json';
const FEATURE_OBJECT_KEY = 'features';

type TopoJSON = {
    type: string;
    objects?: Record<string, unknown>;
    [key: string]: unknown;
};

/**
 * GET /api/heatmap/map
 * Fetches China TopoJSON and returns GeoJSON for echarts.registerMap('china', geoJson).
 */
export async function GET() {
    try {
        const res = await fetch(CHINA_TOPOJSON_URL, {
            next: { revalidate: 86400 },
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch TopoJSON: ${res.status}`);
        }
        const topology = (await res.json()) as TopoJSON;
        const objects = topology.objects;
        if (!objects || typeof objects !== 'object') {
            throw new Error('TopoJSON has no objects');
        }
        const obj = objects[FEATURE_OBJECT_KEY];
        if (!obj) {
            throw new Error(`TopoJSON has no object "${FEATURE_OBJECT_KEY}"`);
        }
        const geojson = feature(topology as Parameters<typeof feature>[0], obj as Parameters<typeof feature>[1]);
        return NextResponse.json(geojson);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
