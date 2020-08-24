import axios, {AxiosResponse} from "axios";
import {Gulpclass, Task} from "gulpclass/Decorators";
import moment from "moment";
import log from "fancy-log";
import {existsSync, readFileSync, statSync, writeFileSync} from "fs";
import {resolve} from "path";

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
    private static readonly SESSIONS_FILE: string = resolve("data", "congresses", "sessions.json");

    // districts
    // district urls are 1-indexed
    private static readonly DISTRICT_URL = (id: number) => `http://cdmaps.polisci.ucla.edu/shp/districts${id.toString().padStart(3, "0")}.zip`;

    private sessions?: Array<CongressionalSession>;

    /**
     * Fetches congressional district session dates from {@link SESSIONS_URL}.
     * Caches parsed sessions to {@link SESSIONS_FILE}; will ignore a cached session if it is older than a day.
     */
    @Task("fetch:sessions")
    public async fetchSessions(): Promise<Gulpfile["sessions"]> {
        // check cached loaded sessions
        if (this.sessions) {
            return this.sessions;
        }

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


        // fetch sessions
        log.info(`Fetching sessions from ${Gulpfile.SESSIONS_URL}`);
        let response: AxiosResponse<string>;
        try {
            response = await axios.get<string>(Gulpfile.SESSIONS_URL, {responseType: "text"});
        } catch (exception) {
            log.error("Failed to fetch sessions");
            throw exception;
        }

        // read raw response
        const sessionsRaw: string = response.data;
        if (!sessionsRaw) throw new Error(`could not fetch congressional sessions; falsy response: ${sessionsRaw}`);

        // find JSON string array
        const sessionsMatch: RegExpMatchArray | null = sessionsRaw.match(/^(?:\s+)?var\s+\w+(?:\s+)=(?:\s+)(.*)(?:\s+)?$/);
        if (sessionsMatch === null) throw new Error(`could not parse array from congressional sessions: ${sessionsRaw}`);

        // parse JSON structure
        const sessionsJson = JSON.parse(sessionsMatch[1]);
        if (!Array.isArray(sessionsJson) || !sessionsJson.every((element: unknown) => typeof element === "string"))
            throw new TypeError("congressional sessions must be a string array");

        // process dates
        this.sessions = [];
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
            this.sessions.push({id, start: fromDate, end: toDate});
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
    public async fetch(): Promise<void> {
        // fetch sessions
        await this.fetchSessions();
    }
}
