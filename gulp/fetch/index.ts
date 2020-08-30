import {Gulpclass, SequenceTask} from "gulpclass/Decorators";
import "./FetchCongressionalDistrictMaps";
import "./PoliticalParties";

@Gulpclass()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Gulpfile {
    /**
     * Fetches all necessary remote data for visualization
     */
    @SequenceTask("fetch")
    public fetch(): string[] {
        return ["fetch:sessions", "fetch:maps", "fetch:party_codes", "fetch:state_codes"];
    }
}
