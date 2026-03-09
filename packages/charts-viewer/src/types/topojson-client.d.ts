declare module 'topojson-client' {
    export function feature(
        topology: unknown,
        object: unknown,
    ): GeoJSON.FeatureCollection | GeoJSON.Feature;
}
