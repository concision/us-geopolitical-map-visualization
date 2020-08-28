import axios, {AxiosResponse} from "axios";
import {Gulpclass, Task} from "gulpclass/Decorators";
import moment from "moment";
import log from "fancy-log";
import {Entry, Parse} from "unzipper";
import {createWriteStream, existsSync, mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync} from "fs";
import {basename, dirname, extname, join, resolve} from "path";
import {IncomingMessage} from "http";
import {exec, ExecException} from "child_process";


/**
 * A congressional district session structure
 */
export interface CongressionalSession {
    /**
     * Congressional session number
     */
    readonly id: number;
    /**
     * Start date of the congressional session
     */
    readonly start: Date;
    /**
     * End date of the congressional session
     */
    readonly end: Date;
}

/**
 * Fetches congressional district shapes and session data from http://cdmaps.polisci.ucla.edu/
 */
@Gulpclass()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Gulpfile {
    // sessions
    private static readonly SESSIONS_URL: string = "http://cdmaps.polisci.ucla.edu/js/sessions.js";
    private static readonly SESSIONS_FILE: string = resolve("data", "sessions.json");

    // districts
    // district urls are 1-indexed
    private static readonly DISTRICT_URL = (id: number) => `http://cdmaps.polisci.ucla.edu/shp/districts${id.toString().padStart(3, "0")}.zip`;
    private static readonly FETCH_RETRIES = 3;
    private static readonly EXPECTED_EXTENSIONS: readonly string[] = Object.freeze([".dbf", ".prj", ".shp", ".shx"]);
    private static readonly GEOJSON_DIRECTORY: string = resolve("data", "congresses");

    private sessions?: CongressionalSession[];

    /**
     * Fetches congressional district session dates from {@link SESSIONS_URL}.
     * Caches parsed sessions to {@link SESSIONS_FILE}; will ignore a cached session if it is older than a day.
     */
    @Task("fetch:sessions")
    public async fetchSessions(): Promise<CongressionalSession[]> {
        // check cached loaded sessions
        if (this.sessions) {
            return this.sessions;
        }

        // check cache file for expiration
        // dirty hack - an if statement that allows breaking
        // noinspection LoopStatementThatDoesntLoopJS
        while /* if */ (existsSync(Gulpfile.SESSIONS_FILE)) {
            log.info(`Reading cached sessions: ${Gulpfile.SESSIONS_FILE}`);

            // continue fetch if cached sessions is older than a day
            try {
                const lastModified: Date = statSync(Gulpfile.SESSIONS_FILE).mtime;
                if (moment(lastModified).isBefore(moment().subtract(1, "days"))) {
                    log.info("Ignoring cached sessions as it is older than a day");
                    break;
                }
            } catch (error) {
                log.error("Failed to read last modified time");
                throw error;
            }

            // read sessions
            let contents: string;
            try {
                contents = readFileSync(Gulpfile.SESSIONS_FILE, "utf8");
            } catch (error) {
                log.error("Failed to read cached sessions");
                throw error;
            }

            // parse sessions
            let sessions: Array<CongressionalSession>;
            try {
                sessions = JSON.parse(contents);
            } catch (error) {
                log.error("Failed to parse cached sessions");
                throw error;
            }

            // load sessions into memory
            log.info(`Loaded ${sessions.length} congressional districts`);
            this.sessions = sessions;

            // exit early using cached sessions
            return this.sessions;
        }


        // fetch sessions from SESSIONS_URL
        log.info(`Fetching sessions from ${Gulpfile.SESSIONS_URL}`);
        let response: AxiosResponse<string>;
        try {
            response = await axios.get<string>(Gulpfile.SESSIONS_URL, {responseType: "text"});
        } catch (exception) {
            log.error("Failed to fetch sessions");
            throw exception;
        }

        // read raw response
        const sessionsString: string = response.data;
        if (!sessionsString)
            throw new Error(`could not fetch congressional sessions; falsy response: ${sessionsString}`);

        // find JSON string array
        const sessionsMatch: RegExpMatchArray | null = sessionsString.match(/^(?:\s+)?var\s+\w+(?:\s+)=(?:\s+)(.*)(?:\s+)?$/);
        if (sessionsMatch === null)
            throw new Error(`could not parse array from congressional sessions: ${sessionsString}`);

        // parse JSON structure
        const sessionsJson = JSON.parse(sessionsMatch[1]);
        if (!Array.isArray(sessionsJson) || !sessionsJson.every((element: unknown) => typeof element === "string"))
            throw new TypeError(`congressional sessions must be a string array; received: ${sessionsString}`);


        // initialize sessions
        this.sessions = [];

        // process dates
        for (const [id, date] of sessionsJson.entries()) {
            // split start and end dates
            const [from, to]: [string, string] = date.split(" to ");

            // parse dates
            const fromDate: Date = new Date(from);
            const toDate: Date = new Date(to);

            // validate dates are legal
            if (!isFinite(fromDate.getTime())) {
                log.error(`Invalid congressional district ${id} start date: ${from}; ignoring session`);
                continue;
            }
            if (!isFinite(toDate.getTime())) {
                log.error(`Invalid congressional district ${id} end date: ${from}; ignoring session`);
                continue;
            }

            // add to known sessions
            this.sessions.push({id: id + 1, start: fromDate, end: toDate});
        }
        log.info(`Loaded ${this.sessions.length} congressional districts`);

        // cache sessions
        writeFileSync(Gulpfile.SESSIONS_FILE, JSON.stringify(this.sessions));

        return this.sessions;
    }

    /**
     * Fetch and process congressional district shape files from {@link DISTRICT_URL}.
     */
    @Task("fetch:maps")
    public async fetchMaps(): Promise<void> {
        // fetch sessions
        const sessions: CongressionalSession[] = await this.fetchSessions();

        // process all maps
        for (const session of sessions) {
            let executed = false;

            // try up to 3 times
            for (let i = 1; i <= 3; i++) {
                try {
                    await this.fetchGeoJson(session);
                    executed = true;
                    break;
                } catch (error) {
                    log.error(`An unexpected error occurred while fetching congressional district ${session.id}${i != Gulpfile.FETCH_RETRIES ? ", retrying..." : ""}`, error);
                }
            }

            if (!executed) {
                log.error(`Failed to fetch congressional district ${session.id}`);
            }
        }
    }

    /**
     * Fetch a specific congressional session to a GeoJSON file
     * @param district {@link CongressionalSession} to fetch
     * @private
     */
    private async fetchGeoJson(district: CongressionalSession): Promise<void> {
        // geoJSON target file
        const geoJsonFile: string = resolve(Gulpfile.GEOJSON_DIRECTORY, `session-${district.id}.geojson`);

        // check for cached geoJSON file
        if (existsSync(geoJsonFile)) {
            log.info(`District ${district.id} GeoJson already cached; skipping`);
            return;
        }

        // generate district url
        const districtUrl: string = Gulpfile.DISTRICT_URL(district.id);
        log.info(`Fetching district ${district.id} from ${districtUrl}`);

        // use a temporary directory
        const directory: string = join("temp", `district-${district.id}`);
        // clean temporary directory
        rmdirSync(directory, {recursive: true});
        mkdirSync(directory, {recursive: true});


        // initiate request
        const cancellationToken = axios.CancelToken.source();
        const response: AxiosResponse<IncomingMessage> = await axios.get(
            districtUrl,
            {
                responseType: "stream",
                cancelToken: cancellationToken.token,
            },
        );

        // expected file extensions
        const remainingExtensions: string[] = [...Gulpfile.EXPECTED_EXTENSIONS];

        // fetch data to the temporary directory
        await new Promise((...[resolve, reject]: Parameters<ConstructorParameters<PromiseConstructor>[0]>) => {
            response.data
                // note: the position of this event callback is important that it comes before unzipping
                .on("close", async function (this: IncomingMessage) {
                    if (!this.complete) {
                        reject(new Error("stream unexpectedly closed"));
                    }
                })
                // decompress zip stream
                .pipe(Parse())
                // process each entry
                .on("entry", (entry: Entry) => {
                    // get entry extension
                    const extension: string = extname(entry.path).toLowerCase();

                    // ignore irrelevant files
                    if (!(entry.type === "File" && dirname(entry.path) === "districtShapes" && remainingExtensions.includes(extension))) {
                        entry.autodrain();
                        return;
                    }

                    // remove extension from remaining extensions expected
                    remainingExtensions.splice(remainingExtensions.indexOf(extension), 1);

                    // compose temporary file path
                    const filePath = join(directory, basename(entry.path));

                    // pipe stream to file
                    entry.pipe(createWriteStream(filePath))
                        // on write complete; check cancellation
                        .on("close", () => {
                            // if all expected extensions were collected, terminate early to save potential bandwidth
                            if (remainingExtensions.length === 0) {
                                // cancel axios request
                                cancellationToken.cancel();
                            }
                        });

                })
                .on("close", () => {
                    resolve();
                });
        });

        // sanity check warning
        if (remainingExtensions.length !== 0) {
            log.warn("Congressional district map archived expected to contain one of each file type: ", Gulpfile.EXPECTED_EXTENSIONS, "found: " + remainingExtensions);
        }


        // execute converter
        await new Promise<void>((resolve, reject) => {
            // noinspection JSUnusedLocalSymbols
            const process = exec(
                `ogr2ogr -f GeoJSON -t_srs crs:84 "${geoJsonFile}" "${directory}"`,
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
        rmdirSync(directory, {recursive: true});
    }
}
