import {Gulpclass, SequenceTask} from "gulpclass/Decorators";
import "./FetchCongressionalDistrictMaps";
import "./FetchCongressionalLegislators";

@Gulpclass()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Gulpfile {
    /**
     * Fetches all necessary remote data for visualization
     */
    @SequenceTask("fetch")
    public fetch(): string[] {
        return ["fetch:maps", "fetch:legislators"];
    }
}
