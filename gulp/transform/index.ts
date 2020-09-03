// eslint-disable-next-line import/no-relative-parent-imports
import {Maps} from "../fetch/FetchCongressionalDistrictMaps";
import {Gulpclass, Task} from "gulpclass/Decorators";
import log from "fancy-log";
// eslint-disable-next-line import/no-unresolved
import GeoJSON from "geojson";
import * as topojson from "topojson-server";
// eslint-disable-next-line
import * as TopoJSON from "topojson-specification";
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from "fs";
import {basename, resolve} from "path";

@Gulpclass()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Transformer {
    /**
     * Transformed TopoJSON output directory path
     * @private
     */
    public static readonly TOPOJSON_FILES: string = resolve("data", "transformed", "congresses");
    /**
     * Converted TopoJSON output file path
     * @private
     */
    private static readonly TOPOJSON_FILE = (id: number): string => resolve(Transformer.TOPOJSON_FILES, `session-${id}.topojson`);

    /**
     * TopoJSON arc quantization
     * @private
     */
    private static readonly QUANTIZATION: number = 10_000;

    /**
     * Converts files from GeoJSON to TopoJSON with modified metadata
     */
    @Task("transform:maps")
    public async transformMaps(): Promise<void> {
        interface CongressionalSessionFile {
            readonly id: number;
            readonly file: string;
        }

        // collect GeoJson files
        const files: CongressionalSessionFile[] = [];
        for (const file of readdirSync(Maps.GEOJSON_FILES)) {
            const match: RegExpMatchArray | null = basename(file).match(Maps.GEOJSON_FILE_REGEX);
            if (match !== null) {
                files.push({
                    // eslint-disable-next-line
                    id: +match.groups!["id"],
                    file: resolve(Maps.GEOJSON_FILES, file),
                });
            }
        }
        // sort for deterministic processing/logging
        files.sort((x: CongressionalSessionFile, y: CongressionalSessionFile): number => x.id - y.id);

        // convert each file to TopoJSON
        for (const {id, file} of files) {
            log.info(`Processing congressional district ${id}: ${file}`);

            // generate target TopoJSON file
            const topoJsonFile: string = Transformer.TOPOJSON_FILE(id);

            // check for cached TopoJSON file
            if (existsSync(topoJsonFile)) {
                log.info(`Congressional session ${id} TopoJSON already converted; skipping`);
                continue;
            }


            // note: this operation is lossy, floats are truncated
            const geojson: GeoJSON.GeoJSON = JSON.parse(readFileSync(file, "utf-8"));

            // validate root GeoJSON object is a FeatureCollection
            if (geojson.type !== "FeatureCollection") {
                log.warn(`Expected GeoJSON file to be a FeatureCollection (found: ${geojson.type}); skipping`);
                continue;
            }

            // eslint-disable-next-line
            const trimCoords = (array: (any[] | number)[]): any[] => array.map(element => Array.isArray(element) ? trimCoords(element) : Math.round(element * 10000) / 10000);

            // strip foreign keys and rewrite properties
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stripped = (function rewriteGeoJson(object: any): any {
                if (object === undefined || object == null) return object;
                // rewrite arrays
                if (Array.isArray(object)) return object.map(element => rewriteGeoJson(element));

                // check that GeoJSON object is
                if (!("type" in object)) throw TypeError("expected GeoJSON type");

                // strip foreign keys on GeoJSON object
                switch (object.type) {
                    case "FeatureCollection":
                        return {type: "FeatureCollection", features: rewriteGeoJson(object.features)};
                    case "Feature":
                        // eslint-disable-next-line no-case-declarations
                        const feature: Partial<GeoJSON.Feature> = {
                            type: "Feature",
                            id: object.id,
                            geometry: rewriteGeoJson(object.geometry),
                        };

                        // rewrite properties
                        if ("properties" in object) {
                            // TODO: rewrite properties
                            feature.properties = object.properties;
                        }

                        return feature;
                    case "GeometryCollection":
                        return {type: "GeometryCollection", geometries: rewriteGeoJson(object.geometries)};
                    default:
                        return {type: object.type, coordinates: trimCoords(object.coordinates), bbox: object.bbox};
                }
            })(geojson);

            // convert to topojson
            const convertedTopoJson: TopoJSON.Topology = topojson.topology({"congressional_districts": stripped}, Transformer.QUANTIZATION);

            // write converted topojson
            mkdirSync(Transformer.TOPOJSON_FILES, {recursive: true});
            writeFileSync(topoJsonFile, JSON.stringify(convertedTopoJson));
        }
    }
}
