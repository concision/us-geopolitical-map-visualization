import axios, {AxiosResponse} from "axios";
import {Gulpclass, Task} from "gulpclass/Decorators";
import log from "fancy-log";
import {Entry, Parse} from "unzipper";
import {createWriteStream, existsSync, mkdirSync, rmdirSync, WriteStream} from "fs";
import {basename, extname, join, resolve} from "path";
import {IncomingMessage} from "http";
import {exec, ExecException} from "child_process";

/**
 * Fetches congressional district shapefiles from various sources
 */
@Gulpclass()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Maps {
    /**
     * Temporary directory path for zip file decompression and GeoJSON conversions
     * @private
     */
    private static readonly TEMP_DIRECTORY = (id: number): string => resolve("temp", "congress", `${id}`);
    /**
     * Converted GeoJSON output directory path
     * @private
     */
    public static readonly GEOJSON_FILES: string = resolve("data", "fetched", "congresses");
    /**
     * Converted GeoJSON output file path
     * @private
     */
    private static readonly GEOJSON_FILE = (id: number): string => resolve(Maps.GEOJSON_FILES, `session-${id}.geojson`);
    /**
     * GeoJSON file name regular expression to capture
     */
    public static readonly GEOJSON_FILE_REGEX = /^session-(?<id>\d+).geojson$/;
    /**
     * Expected extensions for shapefile archives to contain; warnings are emitted if an archive is missing an extension
     * @private
     */
    private static readonly EXPECTED_EXTENSIONS: readonly string[] = Object.freeze([".dbf", ".prj", ".shp", ".shx"]);
    /**
     * Number of attempts to try fetching a map archive before aborting
     * @private
     */
    private static readonly FETCH_RETRIES = 3;

    /**
     * Entries 1-114 are sourced from UCLA:
     * http://cdmaps.polisci.ucla.edu/
     *
     * Entries 115+ are manually sourced from Census Bureau:
     * https://catalog.data.gov/dataset?sort=metadata_created+desc&organization=census-gov&q=shapefile&res_format=ZIP&tags=congressional+districts
     * @private
     */
    private static readonly MANIFEST: { [key: number]: string } = {
        ...(((): { [key: number]: string } => {
            const manifest: { [key: number]: string } = {};
            for (let id = 1; id <= 114; id++) {
                manifest[id] = `http://cdmaps.polisci.ucla.edu/shp/districts${id.toString().padStart(3, "0")}.zip`;
            }
            return manifest;
        })()),
        "115": "https://www2.census.gov/geo/tiger/TIGER2017/CD/tl_2017_us_cd115.zip",
        "116": "https://www2.census.gov/geo/tiger/TIGER2019/CD/tl_2019_us_cd116.zip",
    };

    /**
     * Fetch all congressional district shapefiles
     */
    @Task("fetch:maps")
    public async fetchMaps(): Promise<void> {
        // process all maps
        for (const [id, districtUrl] of Object.entries(Maps.MANIFEST)) {
            let executed = false;

            // try up to 3 times
            for (let i = 1; i <= 3; i++) {
                try {
                    await this.fetchGeoJson(+id, districtUrl);
                    executed = true;
                    break;
                } catch (error) {
                    log.error(`An unexpected error occurred while fetching congressional district ${id}${i != Maps.FETCH_RETRIES ? ", retrying..." : ""}`, error);
                }
            }

            if (!executed) {
                log.error(`Failed to fetch congressional district ${id}`);
            }
        }
    }

    /**
     * Fetch a specific congressional session file and convert to a GeoJSON file
     * @param id {number} congressional session number
     * @param districtUrl {string} HTTP url to fetch congressional map
     * @private
     */
    private async fetchGeoJson(id: number, districtUrl: string): Promise<void> {
        // generate target geoJSON file
        const geoJsonFile: string = Maps.GEOJSON_FILE(id);

        // check for cached geoJSON file
        if (existsSync(geoJsonFile)) {
            log.info(`District ${id} GeoJson already cached; skipping`);
            return;
        }

        log.info(`Fetching district ${id} from ${districtUrl}`);

        // generate temporary directory
        const tempDirectory: string = Maps.TEMP_DIRECTORY(id);
        // clean temporary directory
        rmdirSync(tempDirectory, {recursive: true});
        mkdirSync(tempDirectory, {recursive: true});


        // initiate request
        const cancellationToken = axios.CancelToken.source();
        const response: AxiosResponse<IncomingMessage> = await axios.get(
            districtUrl,
            {
                responseType: "stream",
                cancelToken: cancellationToken.token,
            },
        );

        // expected file extensions to be consumed; expected to be empty after fetching
        const remainingExtensions: string[] = [...Maps.EXPECTED_EXTENSIONS];
        // fetch data to the temporary directory
        await new Promise((...[resolve, reject]: Parameters<ConstructorParameters<PromiseConstructor>[0]>) => {
            // write streams to clean up if a socket failure occurs (releases file locks)
            const streams: WriteStream[] = [];

            // pipe map response
            response.data
                // note: the position of this event callback is important that it comes before unzipping
                .on("close", async function (this: IncomingMessage) {
                    if (!this.complete) {
                        reject(new Error("stream unexpectedly closed"));

                        // close all streams to release file lock
                        for (const stream of streams) {
                            stream.close();
                        }
                    }
                })
                // decompress zip stream
                .pipe(Parse())
                // process each entry
                .on("entry", (entry: Entry) => {
                    // get entry's extension
                    const extension: string = extname(entry.path).toLowerCase();

                    // ignore irrelevant files
                    if (!(entry.type === "File" && remainingExtensions.includes(extension))) {
                        entry.autodrain();
                        return;
                    }

                    // compose temporary file path
                    const filePath = join(tempDirectory, basename(entry.path));

                    // pipe entry stream to file
                    const fileWriteStream = createWriteStream(filePath);
                    streams.push(fileWriteStream);

                    // remove extension from remaining extensions expected
                    remainingExtensions.splice(remainingExtensions.indexOf(extension), 1);

                    // decompress
                    entry.pipe(fileWriteStream)
                        // on write complete; check cancellation
                        .on("close", () => {
                            // finished writing; remove write stream
                            streams.splice(streams.indexOf(fileWriteStream), 1);

                            // if all expected extensions were collected, terminate early to save potential bandwidth
                            if (remainingExtensions.length === 0) {
                                // cancel axios request
                                cancellationToken.cancel();
                            }
                        });

                })
                // close after decompression
                .on("close", resolve);
        });

        // sanity check warning
        if (remainingExtensions.length !== 0) {
            log.warn("Congressional district map archived expected to contain one of each file type: ", Maps.EXPECTED_EXTENSIONS, "found: " + remainingExtensions);
        }


        // execute ogr2ogr converter
        await new Promise<void>((resolve, reject) => {
            // noinspection JSUnusedLocalSymbols
            const process = exec(
                `ogr2ogr -f GeoJSON -t_srs crs:84 "${geoJsonFile}" "${tempDirectory}"`,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (error: ExecException | null, stdout: string, stderr: string): void => {
                    if (error) {
                        log.error("Failed to process ogr2ogr map conversion");
                        log.error(error);
                    }
                },
            );

            // watch exit
            process.on("exit", (code: number) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`ogr2ogr exited with error code ${code}`));
                }
            });
        });

        // clean temporary directory
        rmdirSync(tempDirectory, {recursive: true});
    }
}
