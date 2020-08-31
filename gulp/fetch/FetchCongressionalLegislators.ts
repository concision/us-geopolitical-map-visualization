import {Gulpclass, Task} from "gulpclass/Decorators";
import log from "fancy-log";
import moment from "moment";
import axios, {AxiosResponse} from "axios";
import {parse} from "url";
import {basename, dirname, resolve} from "path";
import {existsSync, mkdirSync, statSync, writeFileSync} from "fs";

type Json = Record<string | number, unknown>;

/**
 * Fetches congress legislators from https://github.com/unitedstates/congress-legislators
 */
@Gulpclass()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Legislators {

    /**
     * Cached file directory
     * @private
     */
    private static readonly CACHED_FILE = (filename: string): string => resolve("data", "fetched", "legislators", filename);

    /**
     * Manifests for:
     * - "Currently serving Members of Congress."
     * - "Historical Members of Congress (i.e. all Members of Congress except those in the current file)."
     * @private
     */
    private static readonly LEGISLATOR_URLS: string[] = [
        "https://theunitedstates.io/congress-legislators/legislators-current.json",
        "https://theunitedstates.io/congress-legislators/legislators-historical.json",
    ];
    /**
     * Manifests for:
     * - "Current social media accounts for Members of Congress. Official accounts only (no campaign or personal accounts)."
     * @private
     */
    private static readonly LEGISLATOR_MEDIA_URL: string = "https://theunitedstates.io/congress-legislators/legislators-social-media.json";
    /**
     * Manifests for:
     * - "Presidents and vice presidents."
     * @private
     */
    private static readonly EXECUTIVE_URL: string = "https://theunitedstates.io/congress-legislators/executive.json";

    /**
     * Fetch all congressional district shapefiles
     */
    @Task("fetch:legislators")
    public async fetchLegislators(): Promise<void> {
        const urls: string[] = [
            ...Legislators.LEGISLATOR_URLS,
            Legislators.LEGISLATOR_MEDIA_URL,
            Legislators.EXECUTIVE_URL,
        ];

        // fetch all urls
        for (const url of urls) {
            // create cached file mapping from the URL name
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const cacheFile: string = Legislators.CACHED_FILE(basename(parse(url).pathname!));
            log.info(`Fetching file from ${url}`);

            // check cache file for an unexpired manifest
            if (existsSync(cacheFile)) {
                // continue fetch if cached sessions is older than a day
                try {
                    const lastModified: Date = statSync(cacheFile).mtime;
                    if (moment(lastModified).isAfter(moment().subtract(1, "month"))) {
                        log.info(`Using cached file: ${cacheFile}`);
                        continue;
                    } else {
                        log.info(`Ignoring cached file, as it is older than a month: ${cacheFile}`)
                    }
                } catch (error) {
                    log.error("Failed to read last modified time of file", error);
                }
            }

            // fetch manifest
            let response: AxiosResponse<Json>;
            try {
                response = await axios.get<Json>(url, {responseType: "json"});
            } catch (exception) {
                log.error("Failed to fetch file");
                throw exception;
            }

            // validate response
            const contents: Json = response.data;
            if (!contents)
                throw new Error(`invalid response; falsy response: ${contents}`);
            // validate JSON is array
            if (!Array.isArray(contents))
                throw new TypeError(`fetched JSON must be an array; received: ${contents}`);

            log.info(`Contains ${contents.length} entries`);

            // cache file
            mkdirSync(dirname(cacheFile), {recursive: true});
            writeFileSync(cacheFile, JSON.stringify(contents));
        }
    }
}
