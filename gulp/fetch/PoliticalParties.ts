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

// noinspection DuplicatedCode
/**
 * Fetches state congress members' political affiliations from https://legacy.voteview.com/icpsr.htm
 */
@Gulpclass()
export class Gulpfile {
    /**
     * Party codes to party names
     * @private
     */
    private static readonly PARTY_CODES_URL: string = "https://legacy.voteview.com/PARTY3.HTM";
    /**
     *
     * @private
     */
    private static readonly PARTY_CODES_FILE: string = resolve("data", "party_codes.json");

    @Task("fetch:party_codes")
    public async fetchPartyCodes(): Promise<void> {
        if (existsSync(Gulpfile.PARTY_CODES_FILE)) {
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
}
