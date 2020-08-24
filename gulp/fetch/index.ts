import {Gulpclass, SequenceTask} from "gulpclass/Decorators";
import "./FetchCongressionalDistrictMaps.ts";

@Gulpclass()
class Gulpfile {
    /**
     * Fetches all necessary remote data for visualization
     */
    @SequenceTask("fetch")
    public fetch(): string[] {
        return ["fetch:sessions", "fetch:maps"];
    }
}
