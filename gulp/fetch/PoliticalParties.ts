import {Gulpclass, Task} from "gulpclass/Decorators";
import log from "fancy-log";
import axios, {AxiosResponse} from "axios";
import {load} from "cheerio";
import moment from "moment";
import {existsSync, statSync, writeFileSync} from "fs";
import {resolve} from "path";

// party

export interface PartyCode {
    readonly id: number;
    readonly name: string;
}

export interface PartyCodeMap {
    [key: number]: string;
}

// state

export interface StateCode {
    readonly id: number;
    readonly code: string;
    readonly name: string;
}

export interface StateCodeMap {
    [key: number]: Pick<StateCode, "code" | "name">;
}

// noinspection DuplicatedCode
/**
 * Fetches state congress members' political affiliations from https://legacy.voteview.com/icpsr.htm
 */
@Gulpclass()
export class Gulpfile {
    /**
     * Resolves party codes to party names
     * @private
     */
    private static readonly PARTY_CODES_URL: string = "https://legacy.voteview.com/PARTY3.HTM";
    /**
     * Cached party codes file
     * @private
     */
    private static readonly PARTY_CODES_FILE: string = resolve("data", "fetched", "party_codes.json");

    /**
     * Resolves state codes to state names
     * @private
     */
    private static readonly STATE_CODES_URL: string = "https://legacy.voteview.com/state_codes_icpsr.htm";
    /**
     * Cached state codes file
     * @private
     */
    private static readonly STATE_CODES_FILE: string = resolve("data", "fetched", "state_codes.json");


    @Task("fetch:party_codes")
    public async fetchPartyCodes(): Promise<void> {
        // check cache file for expiration
        // dirty hack - an if statement that allows breaking
        // noinspection LoopStatementThatDoesntLoopJS
        while /* if */ (existsSync(Gulpfile.PARTY_CODES_FILE)) {
            log.info(`Reading cached party codes: ${Gulpfile.PARTY_CODES_FILE}`);

            // try cached data
            try {
                const lastModified: Date = statSync(Gulpfile.PARTY_CODES_FILE).mtime;
                // check expiration
                if (moment(lastModified).isBefore(moment().subtract(1, "month"))) {
                    log.info("Ignoring political party codes as it is older than a month");
                    return;
                }
            } catch (error) {
                log.error("Failed to read last modified time");
                throw error;
            }
            return;
        }


        // initialize request
        log.info(`Fetching political party codes from ${Gulpfile.PARTY_CODES_URL}`);
        let response: AxiosResponse<string>;
        try {
            response = await axios.get<string>(Gulpfile.PARTY_CODES_URL, {responseType: "text"});
        } catch (exception) {
            log.error("Failed to fetch political party codes");
            throw exception;
        }

        // parse HTML data into a DOM model
        const selector: CheerioStatic = load(response.data);
        // select b tag, nested under a pre tag (there should only be one match);
        const tag: Cheerio = selector("pre > b");
        if (tag.length === 0)
            throw new Error("party code tag not found");
        const textContent: string | null = tag.text();
        if (textContent === null)
            throw new Error("party code tag has no body");
        // parse codes
        const parties: PartyCode[] = textContent.split(/[\r\n]+/)
            //filter out empty lines
            .filter((line: string): boolean => line.length !== 0)
            // trim line from spaces
            .map((line: string): string => line.trim())
            .map((line: string): PartyCode => {
                const [id, ...name] = line.split(/\s+/);
                return {
                    id: parseInt(id),
                    name: name.join(" "),
                };
            });

        // index by id
        const partyMap: PartyCodeMap = {};
        for (const party of parties) {
            partyMap[party.id] = party.name;
        }
        log.info(`Fetched ${parties.length} party code mappings`);

        // cache sessions
        writeFileSync(Gulpfile.PARTY_CODES_FILE, JSON.stringify(partyMap));
    }

    @Task("fetch:state_codes")
    public async fetchStateCodes(): Promise<void> {
        // check cache file for expiration
        // dirty hack - an if statement that allows breaking
        // noinspection LoopStatementThatDoesntLoopJS
        while /* if */ (existsSync(Gulpfile.STATE_CODES_FILE)) {
            log.info(`Reading cached states codes: ${Gulpfile.STATE_CODES_FILE}`);
            try {
                const lastModified: Date = statSync(Gulpfile.STATE_CODES_FILE).mtime;
                // check expiration
                if (moment(lastModified).isBefore(moment().subtract(1, "month"))) {
                    log.info("Ignoring state codes as it is older than a month");
                    break;
                }
            } catch (error) {
                log.error("Failed to read last modified time");
                throw error;
            }
            return;
        }


        // initialize request
        log.info(`Fetching state codes from ${Gulpfile.STATE_CODES_URL}`);
        let response: AxiosResponse<string>;
        try {
            response = await axios.get<string>(Gulpfile.STATE_CODES_URL, {responseType: "text"});
        } catch (exception) {
            log.error("Failed to fetch state codes");
            throw exception;
        }

        // parse HTML data into a DOM model
        const selector: CheerioStatic = load(response.data);
        // select b tag, nested under a pre tag (there should only be one match);
        const tag: Cheerio = selector("pre > b");
        if (tag.length === 0)
            throw new Error("state code tag not found");
        const textContent: string | null = tag.text();
        if (textContent === null)
            throw new Error("state code tag has no body");
        // parse codes
        const states: StateCode[] = textContent.split(/[\r\n]+/)
            //filter out empty lines
            .filter((line: string): boolean => line.length !== 0)
            // trim line from spaces
            .map((line: string): string => line.trim())
            .map((line: string): StateCode => {
                const [id, code, ...name] = line.split(/\s+/);
                return {
                    id: parseInt(id),
                    code: code,
                    name: name.join(" "),
                };
            });

        // index by id
        const codeMap: StateCodeMap = {};
        for (const code of states) {
            codeMap[code.id] = {code: code.code, name: code.name};
        }
        log.info(`Fetched ${states.length} state code mappings`);

        // cache sessions
        writeFileSync(Gulpfile.STATE_CODES_FILE, JSON.stringify(codeMap));
    }
}
